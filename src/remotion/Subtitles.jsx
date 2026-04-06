import React from "react";
import { useCurrentFrame, useVideoConfig, AbsoluteFill, spring, interpolate } from "remotion";

export const Subtitles = ({ phraseGroups }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  // Her phrase group'ta tek kelime var — aktif olanı bul
  const activeIdx = phraseGroups.findIndex((group) => {
    if (!group.words.length) return false;
    const start = group.words[0].start;
    const end = group.words[group.words.length - 1].end;
    return currentTime >= start && currentTime <= end;
  });

  if (activeIdx === -1) return null;

  const activeGroup = phraseGroups[activeIdx];
  const word = activeGroup.words[0];
  const wordStartFrame = Math.round(word.start * fps);

  const appearProgress = spring({
    frame: frame - wordStartFrame,
    fps,
    config: { mass: 0.3, damping: 10, stiffness: 250 },
  });

  const scale = interpolate(appearProgress, [0, 1], [1.4, 1]);
  const opacity = interpolate(appearProgress, [0, 0.3], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          color: "#FFD700",
          fontSize: 64,
          fontWeight: 900,
          fontFamily: "'Arial Black', 'Impact', sans-serif",
          WebkitTextStroke: "3px black",
          textShadow: [
            "4px 4px 0px rgba(0,0,0,1)",
            "-4px -4px 0px rgba(0,0,0,1)",
            "4px -4px 0px rgba(0,0,0,1)",
            "-4px 4px 0px rgba(0,0,0,1)",
            "0px 4px 0px rgba(0,0,0,1)",
            "0px -4px 0px rgba(0,0,0,1)",
            "4px 0px 0px rgba(0,0,0,1)",
            "-4px 0px 0px rgba(0,0,0,1)",
            "0px 0px 12px rgba(0,0,0,0.9)",
          ].join(", "),
          opacity,
          transform: `scale(${scale})`,
          textTransform: "uppercase",
          letterSpacing: "2px",
          textAlign: "center",
          maxWidth: "85%",
          lineHeight: 1.2,
        }}
      >
        {word.text}
      </div>
    </AbsoluteFill>
  );
};
