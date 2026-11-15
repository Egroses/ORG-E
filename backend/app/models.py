"""API contract (docs/design-v2.md). Field names here are the contract with the frontend."""

from typing import List, Literal, Optional

from pydantic import BaseModel, Field, model_validator

Mode = Literal["epoch", "shift_add"]
JobStatus = Literal["queued", "running", "done", "failed"]
ErrorCode = Literal["bad_input", "not_found", "no_coverage", "archive_unavailable", "internal_error"]


class ErrorDetail(BaseModel):
    code: ErrorCode
    message: str


class ErrorResponse(BaseModel):
    error: ErrorDetail


class SkyPosition(BaseModel):
    ra: float = Field(description="degrees, ICRS")
    dec: float = Field(description="degrees, ICRS")


class EpochPosition(SkyPosition):
    epoch: float = Field(description="decimal year")


class Target(BaseModel):
    key: str
    name: str
    ra: float = Field(description="position at epoch 2026.0, degrees")
    dec: float
    pmra: Optional[float] = Field(None, description="mas/yr, includes cos(dec)")
    pmdec: Optional[float] = Field(None, description="mas/yr")
    detector: int = Field(ge=1, le=6)
    mode: Mode
    hint: str


class ResolveResponse(BaseModel):
    query: str
    name: Optional[str] = None
    catalog: EpochPosition
    current: EpochPosition
    pmra: Optional[float] = None
    pmdec: Optional[float] = None
    parallax: Optional[float] = Field(None, description="mas")
    source: Literal["coordinates", "targets", "simbad"]


class JobRequest(BaseModel):
    ra: float = Field(ge=0, lt=360)
    dec: float = Field(ge=-90, le=90)
    fov: float = Field(0.1, ge=0.05, le=0.5, description="field of view, degrees")
    detector: int = Field(6, ge=1, le=6)
    mode: Mode = "epoch"
    pmra: Optional[float] = None
    pmdec: Optional[float] = None

    @model_validator(mode="after")
    def _shift_add_needs_motion(self):
        if self.mode == "shift_add" and (self.pmra is None or self.pmdec is None):
            raise ValueError("shift_add mode needs pmra and pmdec")
        return self


class Progress(BaseModel):
    total: int
    done: int
    failed: int


class Grid(BaseModel):
    """Common pixel grid of all frames in a job (north up, east left)."""

    ra: float
    dec: float
    scale_arcsec: float
    width: int
    height: int


class DisplayRange(BaseModel):
    """One brightness scale shared by every frame of a job, in MJy/sr."""

    min: float
    max: float
    stretch: Literal["asinh", "linear"]


class Frame(BaseModel):
    n: int
    url: str
    t_start: str = Field(description="YYYY-MM-DD")
    t_end: str = Field(description="YYYY-MM-DD")
    mjd_mean: Optional[float] = None
    detector: int
    wavelength_um: List[float] = Field(min_length=2, max_length=2)
    n_images: int
    flagged_fraction: float


class Job(BaseModel):
    id: str
    status: JobStatus
    data_release: Optional[str] = None
    progress: Progress
    center: SkyPosition
    grid: Optional[Grid] = None
    display_range: Optional[DisplayRange] = None
    frames: List[Frame] = []
    error: Optional[ErrorDetail] = Field(None, description="set when status is failed")


class SpectrumPoint(BaseModel):
    wavelength_um: float
    flux_mjy: float
    err_mjy: float
    mjd: float
    detector: int
    flagged: bool = Field(description="a hard bad-pixel bit (NONFUNC, HOT, COLD, PERSIST, OUTLIER, STREAK, "
                                      "SNOWBALL, MISSING_DATA, PHANMISS) in the aperture")
    saturated: bool = Field(False, description="OVERFLOW, SUR_ERROR or BLOOM in the aperture")
    masked_px: int = Field(0, description="aperture pixels with no value (NaN), left out of the sum")
    flag_names: List[str] = Field([], description="every flag bit set in the aperture (FULLSAMPLE, SOURCE not listed)")
    lower_limit: bool = Field(False, description="saturated or masked pixels: the true flux may be higher")


class SpectrumChannel(BaseModel):
    detector: int
    index: int = Field(description="0-16 within the detector")
    wavelength_um: float = Field(description="channel centre (geometric mean of its edges)")
    wavelength_range_um: List[float] = Field(min_length=2, max_length=2)
    flux_mjy: Optional[float] = Field(None, description="median over the usable exposures; null when none")
    err_mjy: Optional[float] = None
    n_exposures: int = Field(description="exposures in the median")
    n_skipped: int = Field(description="exposures left out for a hard bad-pixel bit")
    saturated: bool
    lower_limit: bool


class ChannelSpectrum(BaseModel):
    center: SkyPosition
    aperture_px: float
    unit: str = "mJy"
    channels: List[SpectrumChannel] = Field(description="6 detectors x 17 channels = 102")
    warnings: List[str] = []


class GaiaSource(BaseModel):
    source_id: str
    ra: float = Field(description="propagated to epoch 2026.0")
    dec: float
    gmag: Optional[float] = None
    pmra: Optional[float] = None
    pmdec: Optional[float] = None
    pm_snr: Optional[float] = Field(None, description="proper motion / its error; null when the errors are unknown")


class CatwiseSource(BaseModel):
    name: str
    ra: float = Field(description="propagated to epoch 2026.0")
    dec: float
    w1: Optional[float] = Field(None, description="W1 (3.4 micron) magnitude, w1mpro")
    w2: Optional[float] = Field(None, description="W2 (4.6 micron) magnitude, w2mpro")
    pmra: Optional[float] = Field(None, description="mas/yr (CatWISE gives arcsec/yr)")
    pmdec: Optional[float] = None
    pm_snr: Optional[float] = None
