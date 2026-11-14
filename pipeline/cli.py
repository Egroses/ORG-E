"""Command line interface: python -m pipeline <command> (see SPEC section 9)."""
import argparse
import re
import sys

from .config import ALL_UNITS, ASSIGNMENTS, DETECTORS, TARGETS


def _select_units(assignment, target, detector):
    """The (target, detector) units to process, refusing anything outside the share."""
    share = ASSIGNMENTS[assignment]
    units = [u for u in share if (target is None or u[0] == target) and (detector is None or u[1] == detector)]
    if not units:
        what = ", ".join(x for x in (target, f"D{detector}" if detector else None) if x)
        sys.exit(f"error: {what} is not part of assignment {assignment}")
    return units


def _rehearse(args):
    from .rehearsal import rehearse
    return rehearse(args.who)


def _compare(args):
    from .rehearsal import compare
    return compare(args.a, args.b)


def _download(args):
    from .download import download_units
    units = _select_units(args.assignment, args.target, args.detector)
    failed = download_units(units, args.assignment)
    if failed:
        print(f"{failed} file(s) failed; run the same command again to retry them")
    return 1 if failed else 0


def _verify(args):
    from .verify import verify
    if args.assignment == "all":
        units = ALL_UNITS
    else:
        units = ASSIGNMENTS[args.assignment]
    return 0 if verify(units) else 1


def build_parser():
    parser = argparse.ArgumentParser(prog="python -m pipeline", description="SPHEREx cutout data pipeline")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("rehearse", help="download 5 cutouts and write rehearsal/rehearsal_<who>.json")
    p.add_argument("--who", required=True, type=lambda s: s if re.fullmatch(r"[AB][0-9]*", s) else
                   (_ for _ in ()).throw(argparse.ArgumentTypeError("use A, B, or a name like A2")))
    p.set_defaults(func=_rehearse)

    p = sub.add_parser("compare", help="compare two rehearsal files")
    p.add_argument("a")
    p.add_argument("b")
    p.set_defaults(func=_compare)

    p = sub.add_parser("download", help="download a person's share; resumes where it stopped")
    p.add_argument("--assignment", required=True, choices=["A", "B"])
    p.add_argument("--target", choices=sorted(TARGETS))
    p.add_argument("--detector", type=int, choices=DETECTORS)
    p.set_defaults(func=_download)

    p = sub.add_parser("verify", help="check the cache against the archive listing")
    p.add_argument("--assignment", required=True, choices=["A", "B", "all"])
    p.set_defaults(func=_verify)
    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    return args.func(args)
