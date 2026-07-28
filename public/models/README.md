# Journey avatar assets

Drop your Ready Player Me files here. Anything under `public/` is served at the
site root, so a file at `public/models/avatar.glb` is fetched as `/models/avatar.glb`.

## 1. Avatar (required)

Save your full-body Ready Player Me avatar as:

```
public/models/avatar.glb
```

That's the default the app loads (`AVATAR_URL` in `src/lib/journey/config.ts`).

## 2. Walk / idle animation (optional but recommended)

You said you have an animation ready — save it as:

```
public/models/animations.glb
```

The app reads clips from it by name. It looks for a **walk** clip and an
**idle** clip (case-insensitive; names containing "walk"/"idle"/"stand" match).
If it can't find them, it falls back to a built-in procedural walk cycle, so a
missing or mismatched file never breaks the scene.

Two layouts both work:

- **Separate animation file** (RPM animation library export): a GLB whose only
  content is animation clips authored for the RPM skeleton. Put it here as
  `animations.glb`.
- **Animated avatar**: a single GLB that already contains the mesh *and* the
  clips. In that case just use it as `avatar.glb` and leave `animations.glb` out —
  the app will pick the clips straight off the avatar.

## Overriding paths

Prefer env vars over editing code:

```
NEXT_PUBLIC_AVATAR_URL=/models/avatar.glb
NEXT_PUBLIC_ANIMATIONS_URL=/models/animations.glb
```

An `https://models.readyplayer.me/....glb` URL also works if you'd rather stream
it than commit the file.
