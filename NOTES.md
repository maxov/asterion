# Notes

## Moon orientation options

### Cheap but solid

Add a Moon-specific orientation function and stop using the generic
synchronous `lookAt` path for the Moon.

Implementation shape:
- Keep the current Moon position from `src/lib/orbits.ts`.
- Replace the Moon call site in `src/Scene/Scene.tsx` with something like
  `setMoonQuaternion(...)` in `src/lib/bodyOrientation.ts`.
- In that function, compute the Moon's inertial orientation from the standard
  IAU rotation model:
  - pole right ascension `alpha(t)`
  - pole declination `delta(t)`
  - prime meridian angle `W(t)`
- Convert that equatorial orientation into this app's world frame using the
  same kind of basis change used in `src/lib/astronomicalFrame.ts`.
- Keep one fixed texture calibration offset for the LROC map.

What this gets us:
- correct pole direction
- correct average near-side longitude
- much better visible face than simple tidal lock

What it does not get us:
- true monthly libration

### Principled version

Treat lunar orientation the same way Artemis trajectory data is handled: as a
pipeline asset.

Implementation shape:
- Add a new generic asset type for sampled body orientation, not Moon-specific.
- Pull Moon orientation from a real ephemeris source over a date range.
- Keep position and orientation in the same source family so the flyby and
  visible face stay in sync.
- Emit either:
  - sampled quaternions in world/inertial frame, or
  - sampled `alpha/delta/W` values plus runtime conversion
- At runtime, interpolate the samples and apply them to `moonSpinRef` instead
  of `setSynchronousQuaternion`.

What this gets us:
- actual libration
- correct pole
- correct near/far side over time
- a reusable pattern for other bodies later

### Recommendation

If we do this, skip the halfway measure and build the generic orientation-asset
path. Once Moon-facing accuracy matters for Artemis, matching body position and
body orientation to real ephemeris data is the clean solution.

Likely touch points:
- `src/lib/bodyOrientation.ts`
- `src/Scene/Scene.tsx`
- a new pipeline processor next to
  `pipeline/src/pipeline/processors/jpl_horizons_mission.py`
- a new runtime loader/parser alongside `src/lib/missions.ts`
