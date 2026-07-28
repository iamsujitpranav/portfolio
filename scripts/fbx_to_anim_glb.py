# Blender headless: Mixamo FBX → animation-only GLB.
#
#   blender -b --python scripts/fbx_to_anim_glb.py -- <src.fbx> <dst.glb> <ClipName>
#
# The avatar rig already lives in public/models/Avatar.glb, so a motion file only
# needs to carry the clip. We import the FBX, drop every mesh (the Mixamo
# character body is dead weight — 5 MB of FBX becomes ~100 KB of GLB), rename the
# action to a stable clip name the app looks up, and export.
#
# Bone names keep their `mixamorig:` prefix; Avatar.tsx's retargetWalkClip strips
# it and keeps rotation tracks only, which is what binds the motion to the
# Avaturn skeleton without forcing Mixamo's proportions onto it.

import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1:]
src, dst, clip_name = argv[0], argv[1], argv[2]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=src)

for action in bpy.data.actions:
    action.name = clip_name

# Keep the armature (it carries the animation); bin the character mesh.
for obj in list(bpy.data.objects):
    if obj.type != "ARMATURE":
        bpy.data.objects.remove(obj, do_unlink=True)

bpy.ops.export_scene.gltf(
    filepath=dst,
    export_format="GLB",
    export_animations=True,
    export_animation_mode="ACTIONS",
    export_bake_animation=True,
    export_morph=False,
    export_materials="NONE",
    export_yup=True,
)

print(f"WROTE {dst} clip={clip_name}")
