from app.frames import group_by_epoch


def spans(mjds, **kwargs):
    groups = group_by_epoch([{"mjd": m} for m in mjds], **kwargs)
    return [(g[0]["mjd"], g[-1]["mjd"]) for g in groups]


def test_gap_splits_epochs():
    assert spans([0, 1, 2, 50, 51]) == [(0, 2), (50, 51)]


def test_continuous_coverage_is_cut_at_max_span():
    # one exposure every 5 days for 100 days: no gap, so only the span limit splits it
    result = spans(range(0, 100, 5))
    assert result == [(0, 30), (35, 65), (70, 95)]
    assert all(end - start <= 30 for start, end in result)


def test_max_span_can_be_changed():
    assert spans(range(0, 100, 5), max_span_days=1000) == [(0, 95)]
