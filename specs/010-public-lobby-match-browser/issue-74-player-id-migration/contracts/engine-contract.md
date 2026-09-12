# Contract: Engine ID Registry, Determinism, and Serialization

## Public identity boundary

`MatchConfig.playerIds` is an explicit 2–4 element list of canonical unique
`PlayerId` values. Public `Order`, `Player`, `Event`, `MatchResult`, replay, and
serialization contracts use those values. `playerCount` may remain as a derived
or matchmaking setting where its domain requires it, but it is never a source of
public identity.

## Internal mapping

`PlayerRegistry` is the only supported conversion between IDs and dense indexes.
All conversions are checked. Registry construction is deterministic and uses the
explicit UTF-16 code-unit comparator below:

```text
compareUtf16(a, b): compare a.charCodeAt(i) and b.charCodeAt(i) at the first
different code unit; if one is a prefix, shorter sorts first; equal => 0.
```

`localeCompare`, locale-sensitive collation, numeric coercion, and seat arithmetic
are forbidden for authoritative ordering.

## Serialization

The payload begins with a canonical ID table. Player records refer to table
indexes. Encode/decode must round-trip exact bytes for the same explicit IDs and
reject malformed, duplicate, missing, extra, or numeric identities. Replay input
must supply IDs explicitly; it must not synthesize temporary IDs.

## Determinism witness

For fixed board, seed, settings, explicit ID list, and order sequence:

```text
tick bytes == tick bytes
replay result == replay result
serialization bytes == serialization bytes
```

The same terrain seed/settings/player count with a different valid ID list must
produce identical terrain bytes. ID generation is not part of deterministic state.
