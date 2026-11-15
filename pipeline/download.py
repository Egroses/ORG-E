"""Download cutouts for one (target, detector) unit and keep its manifest up to date."""
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

from . import archive, s3, store
from .config import CACHE, MAX_CONNECTIONS, SIZE_DEG, TARGETS, unit_dir


class ProgressLog:
    """Append-only progress log (timestamps are allowed here, never in cache files)."""

    def __init__(self, path):
        self.path = path
        self.lock = threading.Lock()
        path.parent.mkdir(parents=True, exist_ok=True)

    def line(self, text):
        stamp = datetime.now().isoformat(timespec="seconds")
        with self.lock, open(self.path, "a", encoding="utf-8") as handle:
            handle.write(f"{stamp} {text}\n")


def sync_unit(directory, ra, dec, size_deg, detector, images, label, workers=MAX_CONNECTIONS, log=None, on_progress=None,
              source="irsa"):
    """Make directory hold every cutout of `images` (already filtered to one detector).

    Files already present are skipped, so an interrupted run resumes where it stopped.
    source="irsa": IRSA's cutout service (SPEC). source="s3": the cutout is read from the public
    AWS copy (pipeline/s3.py, ~10x faster, `workers` connections to S3); a file S3 cannot give is
    fetched from IRSA instead, never with more than MAX_CONNECTIONS at a time.
    Returns a dict with the counts and the list of failed file names.
    """
    directory.mkdir(parents=True, exist_ok=True)
    for stale in directory.glob("*.part"):
        stale.unlink()
    present = {image.file for image in images if (directory / image.file).exists()}
    todo = [image for image in images if image.file not in present]
    total = len(images)
    state = {"done": len(present), "failed": [], "errors": {}}
    lock = threading.Lock()
    session = archive.new_session()
    s3_session = s3.new_session(workers) if source == "s3" else None
    irsa_slots = threading.Semaphore(MAX_CONNECTIONS)

    def work(image):
        url = archive.cutout_url(image.access_url, ra, dec, size_deg)
        error = None
        try:
            if s3_session is not None:
                try:
                    s3.fetch_cutout(s3_session, image.access_url, ra, dec, size_deg, directory / image.file)
                    return report(image, None)
                except s3.S3Error as exc:
                    if log is not None:
                        log.line(f"{label} s3 failed for {image.file} ({exc}); trying IRSA")
            with irsa_slots:
                archive.fetch_cutout(session, url, directory / image.file)
        except archive.FetchError as exc:
            error = str(exc)
        report(image, error)

    def report(image, error):
        with lock:
            if error is None:
                state["done"] += 1
            else:
                state["failed"].append(image.file)
                state["errors"][image.file] = error
            message = f"{label} done={state['done']}/{total} failed={len(state['failed'])}"
            if error is not None:
                message += f" error={image.file}: {error}"
            if log is not None:
                log.line(message)
            if on_progress is not None:
                on_progress(state["done"], total, len(state["failed"]))

    if log is not None:
        log.line(f"{label} start total={total} cached={len(present)} to_download={len(todo)}")
    with ThreadPoolExecutor(workers) as pool:
        list(pool.map(work, todo))

    failed = sorted(state["failed"])
    failed_path = directory / "failed.txt"
    if failed:
        failed_path.write_text("".join(f"{name}\n" for name in failed), encoding="utf-8", newline="\n")
    elif failed_path.exists():
        failed_path.unlink()
    store.rebuild_manifest(
        directory, ra, dec, size_deg, detector, {image.file: image for image in images},
        archive.cutout_url if source == "irsa" else s3_source_url,
    )
    if log is not None:
        log.line(f"{label} finished total={total} failed={len(failed)}")
    return {
        "total": total, "cached": len(present), "downloaded": len(todo) - len(failed),
        "failed": failed, "errors": state["errors"],
    }


def s3_source_url(access_url, ra, dec, size_deg):
    """source_url of a cutout read from S3: the file on S3 and the box (manifest column)."""
    return f"{s3.s3_url(access_url)}#center={ra:.6f},{dec:.6f}&size={size_deg:g}"


def download_units(units, who):
    """Download the given (target, detector) units in order. Returns the number of failed files."""
    log = ProgressLog(CACHE / f"download_{who}.log")
    listings = {}
    failed_total = 0
    for key, detector in units:
        target = TARGETS[key]
        if key not in listings:
            listings[key] = archive.list_images(target["ra"], target["dec"])
        images = [image for image in listings[key] if image.detector == detector]
        label = f"{key} D{detector}"
        print(f"[{label}] {len(images)} images listed", flush=True)
        result = sync_unit(
            unit_dir(CACHE, key, detector), target["ra"], target["dec"], SIZE_DEG, detector,
            images, label, log=log,
        )
        failed_total += len(result["failed"])
        print(
            f"[{label}] total={result['total']} cached={result['cached']} "
            f"downloaded={result['downloaded']} failed={len(result['failed'])}",
            flush=True,
        )
        for name in result["failed"]:
            print(f"    FAILED {name}: {result['errors'][name]}", flush=True)
    return failed_total
