// The 3D walk curve. Built from the trail centerline with heights sampled from
// the terrain so the path rides the ground. Shared by the avatar (movement),
// the camera rig, the visible ribbon, and the waypoint markers.

import * as THREE from "three";
import { walkHeight } from "./terrain";
import { SIDE_ROAD_CONTROL } from "./sideroad";
import { EDGE_IDS, edgeSamplesXZ, edgeLength, spineSamplesXZ } from "./graph";

export function buildWalkCurve(): THREE.CatmullRomCurve3 {
  // The GRAND TOUR curve — built from the spine chain's own road samples, so
  // every u-keyed placement (lamps, gems, obstacles, snowmen, dioramas) rides
  // the real roads of the network, bridge deck included (walkHeight).
  // Plant the walker on TOP of the road ribbon (which is laid at height + 0.06,
  // see TrailPath), plus a little clearance, so the soles rest on the road
  // instead of sinking 0.03 below it and clipping through as the legs swing.
  const pts = spineSamplesXZ(3).map(
    ([x, z]) => new THREE.Vector3(x, walkHeight(x, z) + 0.1, z),
  );
  const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.5);
  // getPointAt() re-parameterises by arc length through a lookup table, and
  // three's default of 200 entries is far too coarse for a ~400 m tour: each
  // cell spans 2 m and the mapping is linear inside it, so ground speed
  // surged and sagged by 35% along the route (measured 57–82 mm per frame
  // against a 68 mm mean). That is both a visible judder and live foot skate,
  // since the legs play at one fixed rate. 4800 entries puts a cell at ~8 cm.
  curve.arcLengthDivisions = 4800;
  curve.updateArcLengths();
  return curve;
}

// One 3D walk curve PER GRAPH EDGE, keyed by edge id. Same recipe as the spine
// curve (control points on top of the ribbon, arc-length reparameterized so ground
// speed is even), but built from each edge's dense XZ samples. The avatar rides
// these — it carries a route (a list of edges) and walks each edge's curve in turn.
// Divisions scale with edge length to keep the ~8 cm/cell density that killed the
// foot-skate on the single curve.
export function buildEdgeCurves(): Map<string, THREE.CatmullRomCurve3> {
  const out = new Map<string, THREE.CatmullRomCurve3>();
  for (const id of EDGE_IDS) {
    const pts = edgeSamplesXZ(id).map(([x, z]) => new THREE.Vector3(x, walkHeight(x, z) + 0.1, z));
    const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.5);
    curve.arcLengthDivisions = Math.max(64, Math.round(edgeLength(id) * 12));
    curve.updateArcLengths();
    out.set(id, curve);
  }
  return out;
}

// The village side-road, riding just on top of the snow (like the trail ribbon).
// Shared by the road ribbon and the moving van (SideRoad.tsx).
export function buildSideRoadCurve(): THREE.CatmullRomCurve3 {
  const pts = SIDE_ROAD_CONTROL.map(
    ([x, z]) => new THREE.Vector3(x, walkHeight(x, z) + 0.06, z),
  );
  return new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.5);
}
