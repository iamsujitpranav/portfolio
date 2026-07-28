# 3D Journey — asset drop-in list

The scene is fully procedural right now (no downloaded assets). These are the
files that close the gap to photoreal. All sources below are **CC0** (free, no
attribution). Drop them at the paths shown, tell me they're in, and I'll wire
each one — every item is additive and independently optional.

Ranked by realism-per-effort.

---

## 1. Walk motion clip  ★ biggest win for the avatar
**Path:** `public/models/animations.glb`

- Go to [mixamo.com](https://www.mixamo.com) (free Adobe login).
- Search **"Walking"**, pick an in-place walk you like.
- Upload your `Avatar_Tpose.glb` as the character (or use the default), or just
  download the animation on any character.
- **Download** → Format **glTF Binary (.glb)**, Skin **Without Skin** (animation
  only), Frames per Second 30, keyframe reduction none.
- Save it as `public/models/animations.glb`.

Already wired: the loader strips the `mixamorig:` prefixes and the root motion,
then crossfades idle↔walk automatically. Nothing else needed.

> Note: Mixamo↔Avaturn is close but not a perfect skeleton match, so a clip may
> need a small `WALK.clipTimeScale` tweak in `src/lib/journey/config.ts` to stop
> foot-sliding. If it looks wrong, a Walking clip retargeted specifically to the
> Avaturn/RPM rig is the cleanest.

## 2. HDRI environment map  ★ biggest win for the world
**Path:** `public/env/sky.hdr`

- [polyhaven.com/hdris](https://polyhaven.com/hdris) → an outdoor daytime one
  (e.g. *Kloofendal*, *Qwantani*, *Sunflowers*). Download **HDR, 2K**.
- Save as `public/env/sky.hdr`.

I'll swap the procedural Lightformer environment for `<Environment files="/env/sky.hdr">`
— real sky reflections and grounded lighting on the avatar, terrain, and trees.

## 3. Ground PBR textures (tileable)
**Path:** `public/textures/ground/` — three sets:

```
grass_diff.jpg  grass_nor.jpg  grass_rough.jpg
rock_diff.jpg   rock_nor.jpg   rock_rough.jpg
dirt_diff.jpg   dirt_nor.jpg   dirt_rough.jpg   (for the path)
```

- [polyhaven.com/textures](https://polyhaven.com/textures) or
  [ambientcg.com](https://ambientcg.com) → "grass", "rock cliff", "dirt/ground".
  Grab **Diffuse/Albedo, Normal (GL), Roughness**, 1K–2K, JPG.

I'll height/slope-splat these across the terrain (grass low, rock on slopes,
dirt on the path) in place of the flat vertex colors.

## 4. Trees / foliage
Pick **one** approach:

- **A — GLB tree models (easiest, stylized-realistic):**
  `public/models/trees/pine.glb`, `public/models/trees/broadleaf.glb`
  Free packs: [Quaternius Ultimate Nature](https://quaternius.com) (CC0) or
  KayKit. I'll instance these in place of the cone/sphere trees.
- **B — Alpha foliage cards (most realistic, heavier):**
  `public/textures/foliage/leaf.png` (RGBA, alpha cutout) + a bark texture.
  I'll build crossed-billboard trees with wind. More work, better silhouettes.

## 5. Optional polish
- `public/textures/grass_blade.png` — alpha blade for instanced wind-grass along the path.
- `public/audio/footsteps.mp3`, `public/audio/ambience.mp3` — footstep + forest ambience (subtle, muted by default).

---

### Where things get wired
- Env / textures / trees: `src/components/journey/{Scene,Terrain,Forest}.tsx`
- Walk clip + gait knobs: `src/components/journey/Avatar.tsx`, `src/lib/journey/config.ts`
