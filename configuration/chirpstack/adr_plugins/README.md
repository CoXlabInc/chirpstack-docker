# KR920 SF6/SF5 ADR plugin

`kr920_sf56.js` is a custom ADR algorithm for RP002-1.0.5-capable KR920
devices. It progresses through DR0-DR5, DR12, and DR13 without issuing the
reserved DR6-DR11 values.

Use it only with a Device Profile that supports DR12/SF6 and DR13/SF5.
