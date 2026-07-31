"use client";

import { useMemo, useState } from "react";
import { Billboard, useCursor } from "@react-three/drei";
import { height } from "@/lib/journey/terrain";
import { FOUNTAINS, SOCIAL_BOARDS } from "@/lib/journey/settlement";
import { profile } from "@content/resume";
import type { DisplayFocus } from "./CameraRig";
import MatrixSignFace from "./MatrixSignFace";

// Wooden boards ringing the GRAND FOUNTAIN on the TOWN SQUARE — the five-way
// Crossroads where the journey spawns — that link out: WhatsApp, LinkedIn,
// GitHub, email. The square's front door: an arc of four across the wedge's
// far side, every post facing back over the water at the junction, so a
// visitor walking in from any of the five roads reads all of them. Clicking a
// board opens the shared social directory; links open only from that display. Ring positions live in
// settlement.ts (SOCIAL_BOARDS — audited by square_audit.ts, ≥ 6.6 m clear of
// every lane) so the street lamps can keep off them.

type Social = { id: string; label: string; href: string; x: number; z: number; fx: number; fz: number; yaw: number };

function SocialBoard({ social, onOpen }: { social: Social; onOpen: (focus: DisplayFocus) => void }) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered, "pointer", "auto");
  const open = () => onOpen({
    id: "social",
    x: social.x,
    y: height(social.x, social.z) + 1.55,
    z: social.z,
    fx: social.fx,
    fz: social.fz,
  });

  return (
    <group position={[social.x, height(social.x, social.z), social.z]}>
      <mesh position={[0, 0.88, 0]} castShadow>
        <boxGeometry args={[0.09, 1.76, 0.09]} />
        <meshStandardMaterial color="#07110b" metalness={0.55} roughness={0.45} />
      </mesh>
      <Billboard
        position={[0, 1.55, 0]}
        follow
        lockX
        lockZ
      >
        <group
          scale={hovered ? 1.06 : 1}
          onClick={(event) => { event.stopPropagation(); open(); }}
          onPointerOver={(event) => { event.stopPropagation(); setHovered(true); }}
          onPointerOut={() => setHovered(false)}
        >
          <mesh castShadow>
            <boxGeometry args={[1.8, 0.66, 0.08]} />
            <meshStandardMaterial color="#020705" emissive="#063719" emissiveIntensity={hovered ? 0.72 : 0.4} metalness={0.68} roughness={0.35} />
          </mesh>
          <MatrixSignFace
            width={1.8}
            height={0.66}
            title={social.label}
            subtitle="Social channel"
            action="OPEN DIRECTORY"
            system="SOCIAL_LINK"
            active={hovered}
          />
        </group>
      </Billboard>
    </group>
  );
}

export default function SocialSignposts({ onOpen }: { onOpen: (focus: DisplayFocus) => void }) {
  const placed = useMemo(() => {
    const wa = `https://wa.me/${profile.phone.replace(/[^0-9]/g, "")}`;
    const fountain = FOUNTAINS.find((f) => f.grand)!;
    const links = [
      { id: "whatsapp", label: "WhatsApp", href: wa },
      { id: "linkedin", label: "LinkedIn", href: profile.linkedin },
      { id: "github", label: "GitHub", href: profile.github },
      { id: "email", label: "Gmail", href: "mailto:" + profile.email },
    ];
    const posts: Omit<Social, "fx" | "fz" | "yaw">[] = links.map((l, i) => ({ ...l, ...SOCIAL_BOARDS[i] }));
    return posts.map((s) => {
      const dx = fountain.x - s.x;
      const dz = fountain.z - s.z;
      const l = Math.hypot(dx, dz) || 1;
      return { ...s, fx: dx / l, fz: dz / l, yaw: Math.atan2(dx, dz) };
    });
  }, []);

  return (
    <group>
      {placed.map((s) => (
        <SocialBoard key={s.id} social={s} onOpen={onOpen} />
      ))}
    </group>
  );
}
