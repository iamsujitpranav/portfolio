"use client";

import { useMemo } from "react";
import { Html } from "@react-three/drei";
import { height } from "@/lib/journey/terrain";
import { LINKEDIN_URL, GITHUB_URL } from "@/lib/journey/config";
import { FOUNTAINS, SOCIAL_BOARDS } from "@/lib/journey/settlement";
import { profile } from "@content/resume";

// Wooden boards ringing the GRAND FOUNTAIN on the TOWN SQUARE — the five-way
// Crossroads where the journey spawns — that link out: WhatsApp, LinkedIn,
// GitHub, email. The square's front door: an arc of four across the wedge's
// far side, every post facing back over the water at the junction, so a
// visitor walking in from any of the five roads reads all of them. Clicking a
// board opens the destination in a new tab. Ring positions live in
// settlement.ts (SOCIAL_BOARDS — audited by square_audit.ts, ≥ 6.6 m clear of
// every lane) so the street lamps can keep off them.

type Social = { id: string; label: string; href: string; x: number; z: number };

export default function SocialSignposts() {
  const placed = useMemo(() => {
    const wa = `https://wa.me/${profile.phone.replace(/[^0-9]/g, "")}`;
    const fountain = FOUNTAINS.find((f) => f.grand)!;
    const links = [
      { id: "whatsapp", label: "WhatsApp ↗", href: wa },
      { id: "github", label: "GitHub ↗", href: GITHUB_URL },
      { id: "linkedin", label: "LinkedIn ↗", href: LINKEDIN_URL },
      { id: "email", label: "Email ↗", href: `mailto:${profile.email}` },
    ];
    const posts: Social[] = links.map((l, i) => ({ ...l, ...SOCIAL_BOARDS[i] }));
    return posts.map((s) => ({
      ...s,
      yaw: Math.atan2(fountain.x - s.x, fountain.z - s.z),
    }));
  }, []);

  return (
    <group>
      {placed.map((s) => (
        <group key={s.id} position={[s.x, height(s.x, s.z), s.z]} rotation={[0, s.yaw, 0]}>
          <mesh position={[0, 1.0, 0]} castShadow>
            <boxGeometry args={[0.11, 2.0, 0.11]} />
            <meshStandardMaterial color="#6b5334" roughness={1} />
          </mesh>
          <mesh position={[0, 1.75, 0]} rotation={[0, 0, 0.06]} castShadow>
            <boxGeometry args={[1.25, 0.44, 0.08]} />
            <meshStandardMaterial color="#5f7ba8" roughness={0.9} />
          </mesh>
          <Html
            position={[0, 2.35, 0]}
            center
            distanceFactor={16}
            occlude={false}
            style={{ pointerEvents: "auto" }}
          >
            <button
              className="jrnSign"
              onClick={() => window.open(s.href, "_blank", "noopener,noreferrer")}
            >
              {s.label}
            </button>
          </Html>
        </group>
      ))}
    </group>
  );
}
