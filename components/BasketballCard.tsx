"use client";
import Image from "next/image";

interface CardProps {
  name: string;
  namePinyin: string;
  number: string;
  position: string;
  photo?: string | null;
  prebuiltCard?: string | null;
  size?: "full" | "mini";
}

export default function BasketballCard({
  name, namePinyin, number, position, photo, prebuiltCard, size = "full",
}: CardProps) {
  const isMini = size === "mini";

  // Pre-built card — just show the image
  if (prebuiltCard) {
    return (
      <div className={`relative overflow-hidden rounded-2xl shadow-xl ${isMini ? "w-28 h-44" : "w-56 h-80"}`}>
        <Image
          src={prebuiltCard}
          alt={name}
          fill
          className="object-cover object-top"
          sizes={isMini ? "112px" : "224px"}
        />
      </div>
    );
  }

  // Generated card from photo
  return (
    <div
      className={`relative overflow-hidden rounded-2xl shadow-xl flex flex-col ${isMini ? "w-28 h-44" : "w-56 h-80"}`}
      style={{ background: "linear-gradient(160deg, #0a1628 0%, #12234a 40%, #1a3366 100%)" }}
    >
      {/* Background shimmer */}
      <div className="absolute inset-0 opacity-20"
        style={{ background: "radial-gradient(ellipse at 60% 30%, #4a90d9 0%, transparent 70%)" }} />

      {/* CHILDHOOD watermark */}
      <div className={`absolute top-0 left-0 right-0 text-center font-black tracking-widest opacity-15 text-white select-none ${isMini ? "text-xs pt-1" : "text-base pt-2"}`}
        style={{ fontFamily: "Impact, Arial Black, sans-serif", letterSpacing: "0.15em" }}>
        CHILDHOOD
      </div>

      {/* Top badges */}
      {!isMini && (
        <div className="relative z-10 flex items-start justify-between px-2 pt-2">
          {/* NBA-style logo placeholder */}
          <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center shadow">
            <span className="text-xs font-black text-blue-900">🏀</span>
          </div>
          {/* RC CARD */}
          <div className="border border-yellow-400 rounded px-1 text-center" style={{ lineHeight: 1 }}>
            <div className="text-yellow-400 font-black text-xs">ROOKIE</div>
            <div className="text-yellow-400 font-black text-base leading-none">RC</div>
            <div className="text-yellow-400 font-black text-xs">CARD</div>
          </div>
        </div>
      )}

      {/* Player photo — takes most of card */}
      {photo && (
        <div className={`relative flex-1 mx-auto w-full ${isMini ? "mt-0" : "-mt-2"}`}>
          <Image
            src={photo}
            alt={name}
            fill
            className="object-cover object-top"
            sizes={isMini ? "112px" : "224px"}
          />
          {/* Bottom gradient overlay for text */}
          <div className="absolute bottom-0 left-0 right-0 h-2/5"
            style={{ background: "linear-gradient(to top, rgba(10,22,40,1) 0%, rgba(10,22,40,0.7) 60%, transparent 100%)" }} />
        </div>
      )}

      {/* Bottom info */}
      <div className={`relative z-10 ${isMini ? "px-1.5 pb-1.5" : "px-3 pb-3"} ${photo ? "-mt-10" : "mt-auto"}`}>
        {!isMini && (
          <>
            {/* Number big */}
            <div className="text-5xl font-black leading-none mb-1"
              style={{ color: "#c8a84b", fontFamily: "Impact, Arial Black, sans-serif", textShadow: "0 0 20px rgba(200,168,75,0.4)" }}>
              {number}
            </div>
            {/* Name */}
            <div className="text-white font-black text-sm uppercase tracking-wide">{namePinyin}</div>
            <div className="text-white font-bold text-base">{name}</div>
            {/* Position */}
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-yellow-400 text-xs">★★</span>
              <span className="text-gray-300 text-xs font-medium">{position}</span>
              <span className="text-yellow-400 text-xs">★★</span>
            </div>
            <div className="text-yellow-500 text-xs font-medium mt-0.5 tracking-wider">PLAY HARD, DREAM BIG.</div>
          </>
        )}
        {isMini && (
          <>
            <div className="text-yellow-400 font-black text-lg leading-none"
              style={{ fontFamily: "Impact, Arial Black, sans-serif" }}>#{number}</div>
            <div className="text-white font-bold text-xs truncate">{name}</div>
            <div className="text-gray-400 text-xs">{position}</div>
          </>
        )}
      </div>

      {/* PLAYABALL bottom right */}
      {!isMini && (
        <div className="absolute bottom-2 right-2 text-gray-500 text-xs font-bold tracking-wider">PLAYABALL</div>
      )}

      {/* Left vertical text */}
      {!isMini && (
        <div className="absolute left-1 top-1/2 -translate-y-1/2 text-white/10 font-black tracking-widest select-none"
          style={{ writingMode: "vertical-rl", fontSize: 10, fontFamily: "Impact, Arial Black, sans-serif", letterSpacing: "0.3em" }}>
          CHILDHOOD
        </div>
      )}

      {/* Gold diagonal accent */}
      {!isMini && (
        <div className="absolute bottom-16 left-0 w-1 h-24 opacity-60"
          style={{ background: "linear-gradient(to bottom, transparent, #c8a84b, transparent)", transform: "rotate(-10deg) translateX(-2px)" }} />
      )}
    </div>
  );
}
