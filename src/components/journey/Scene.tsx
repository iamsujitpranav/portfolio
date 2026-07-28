"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import {
  EffectComposer,
  N8AO,
  Bloom,
  HueSaturation,
  BrightnessContrast,
  Vignette,
  SMAA,
  ToneMapping,
} from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import Terrain from "./Terrain";
import Scatter from "./Scatter";
import Water from "./Water";
import Bridge from "./Bridge";
import SkyDome from "./SkyDome";
import DayNight from "./DayNight";
import { Fireflies } from "./Particles";
import Snow from "./Snow";
import Dust from "./Dust";
import Dioramas from "./Dioramas";
import Landmarks from "./Landmarks";
import Fountains from "./Fountains";
import Settlement from "./Settlement";
import Vehicles from "./Vehicles";
import SideRoad from "./SideRoad";
import StreetLamps from "./StreetLamps";
import TrailPath from "./TrailPath";
import Obstacles from "./Obstacles";
import Curling from "./Curling";
import Snowballs from "./Snowballs";
import Collectibles from "./Collectibles";
import GameKiosk from "./GameKiosk";
import Avatar, { type Nav } from "./Avatar";
import CameraRig from "./CameraRig";
import SocialSignposts from "./SocialSignposts";
import { buildWalkCurve, buildEdgeCurves } from "@/lib/journey/curve";
import { FOG_COLOR, FOG_DENSITY } from "@/lib/journey/config";
import { sunState } from "@/lib/journey/daynight";
import { avatarPos } from "@/lib/journey/game";

// Tone mapping happens inside the composer (the ACES ToneMapping effect), so
// hand it off from the renderer to avoid mapping the image twice.
function RendererSetup() {
  const { gl } = useThree();
  useEffect(() => {
    const prev = gl.toneMapping;
    gl.toneMapping = THREE.NoToneMapping;
    return () => {
      gl.toneMapping = prev;
    };
  }, [gl]);
  return null;
}

// The key light follows the avatar so a tight, sharp shadow frustum stays
// centered on the character wherever they walk — reading the shared avatarPos
// singleton, so it tracks correctly on the scenic loops too (which live off the
// legacy spine scalar).
function Sun() {
  const light = useRef<THREE.DirectionalLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);
  const { scene } = useThree();
  // Low, raking golden-hour angle — long dramatic shadows instead of a flat
  // overhead key. Kept to the left/front so the trail is side-lit as it climbs.
  const offset = useMemo(() => new THREE.Vector3(-52, 19, 30), []);

  useEffect(() => {
    scene.add(target);
    return () => {
      scene.remove(target);
    };
  }, [scene, target]);

  useFrame(() => {
    if (light.current) {
      light.current.position.set(
        avatarPos.x + offset.x,
        avatarPos.y + offset.y,
        avatarPos.z + offset.z,
      );
      target.position.set(avatarPos.x, avatarPos.y, avatarPos.z);
      target.updateMatrixWorld();
      // Colour + strength come from the day/night cycle (direction stays fixed).
      light.current.color.copy(sunState.color);
      light.current.intensity = sunState.intensity;
    }
  });

  return (
    <directionalLight
      ref={light}
      target={target}
      intensity={2.9}
      color="#ffce93"
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-bias={-0.0004}
      shadow-normalBias={0.02}
      shadow-camera-near={1}
      shadow-camera-far={170}
      shadow-camera-left={-58}
      shadow-camera-right={58}
      shadow-camera-top={58}
      shadow-camera-bottom={-58}
    />
  );
}

export default function Scene({
  nav,
  activeId,
  onPick,
  onProject,
  onLoaded,
  onReady,
  onArrive,
}: {
  nav: Nav;
  activeId: string;
  onPick: (id: string) => void;
  /** A project landmark's plaque was clicked — open its card. */
  onProject: (panelId: string) => void;
  onLoaded: () => void;
  onReady: () => void;
  onArrive: () => void;
}) {
  // The legacy single spine curve (still feeds the ribbon, signs, games and
  // lights in this phase) + the per-edge curves the route-driven avatar walks.
  const curve = useMemo(() => buildWalkCurve(), []);
  const edgeCurves = useMemo(() => buildEdgeCurves(), []);
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const hemiRef = useRef<THREE.HemisphereLight>(null);

  return (
    <>
      <RendererSetup />
      <color attach="background" args={[FOG_COLOR]} />
      <fogExp2 attach="fog" args={[FOG_COLOR, FOG_DENSITY]} />

      {/* Stylized gradient sky, animated across the day↔night cycle (SkyDome
          binds the shared day/night uniforms). */}
      <SkyDome />

      {/* Small baked IBL — mostly for the PBR avatar; the flat-shaded world is
          driven by the direct lights below. Warm key-side lightformer + a dim
          cool bounce from the opposite side for a touch of shadow separation. */}
      <Environment resolution={128} frames={1} background={false}>
        {/* Cool key + cool bounce: a warm IBL used to tint the snow amber, so the
            key light is now a near-white cool so the snow reads white. */}
        <Lightformer form="circle" intensity={4.0} color="#eef3fb" scale={16} position={[-46, 18, 28]} />
        <Lightformer form="rect" intensity={0.55} color="#8fa6c4" scale={[80, 40, 1]} position={[30, 30, -34]} />
      </Environment>

      {/* Warm sky-fill, deep warm ground bounce, and a low overall ambient so the
          shadows keep their weight (the wash-out came from strong cool fill). */}
      <hemisphereLight ref={hemiRef} args={["#f4c489", "#3b2f1c", 0.42]} />
      <ambientLight ref={ambientRef} intensity={0.12} color="#ffe6c2" />
      <Sun />
      <DayNight ambientRef={ambientRef} hemiRef={hemiRef} />

      <Terrain />
      <Water />
      <Bridge />
      <Scatter />
      <Dioramas />
      <Fountains />
      {/* The project landmarks: each real piece of work, built as a structure
          beside the road that leads to the stop it belongs to. */}
      <Landmarks onPick={onProject} />
      <Suspense fallback={null}>
        <Settlement />
        <Vehicles />
        <SideRoad />
      </Suspense>
      <StreetLamps />
      <Snow />
      <Fireflies />
      <Dust nav={nav} />
      <TrailPath edgeCurves={edgeCurves} activeId={activeId} onPick={onPick} />
      <SocialSignposts />

      {/* Mini-games layered onto the trail: the obstacle runner, snowball
          targets, hidden collectibles, curling on the frozen pond, and the two
          kiosk games (tic-tac-toe and stack match) in the village. */}
      <Obstacles curve={curve} nav={nav} />
      <Collectibles curve={curve} nav={nav} />
      <Snowballs curve={curve} />
      <Curling />
      <Suspense fallback={null}>
        <GameKiosk />
      </Suspense>

      <Suspense fallback={null}>
        <Avatar
          edgeCurves={edgeCurves}
          nav={nav}
          onLoaded={onLoaded}
          onReady={onReady}
          onArrive={onArrive}
        />
      </Suspense>

      <CameraRig edgeCurves={edgeCurves} nav={nav} />

      {/* Cinematic post chain. N8AO grounds contacts; Bloom (pre-tonemap, on the
          HDR buffer) gives the sun-side grass, water sheen and sky a golden glow;
          ACES maps to screen; then a light grade — a nudge of saturation and
          contrast — sells the "graded" look; vignette frames it; SMAA last to
          crisp the low-poly edges. */}
      <EffectComposer multisampling={0} enableNormalPass={false}>
        <N8AO aoRadius={3} distanceFalloff={1} intensity={1.45} halfRes />
        <Bloom intensity={0.5} luminanceThreshold={0.82} luminanceSmoothing={0.3} mipmapBlur />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <HueSaturation saturation={0.18} hue={0} />
        <BrightnessContrast brightness={0.0} contrast={0.15} />
        <Vignette eskil={false} offset={0.28} darkness={0.52} />
        <SMAA />
      </EffectComposer>
    </>
  );
}
