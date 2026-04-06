import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  useVideoConfig,
  Loop,
  OffthreadVideo,
} from "remotion";
import { Subtitles } from "./Subtitles";

export const ShortVideo = ({
  mediaPaths,
  audioPath,
  bgMusicPath,
  phraseGroups,
  outroPath,
  outroAudioPath,
  outroText,
  outroDurationFrames,
  mainDurationFrames,
  useSubtitles,
}) => {
  const { fps } = useVideoConfig();
  const clipCount = mediaPaths.length;
  const framesPerClip = Math.ceil(mainDurationFrames / clipCount);

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {/* Layer 1: Sequenced video clips */}
      {mediaPaths.map((clipPath, i) => (
        <Sequence
          key={i}
          from={i * framesPerClip}
          durationInFrames={
            i === clipCount - 1
              ? mainDurationFrames - i * framesPerClip
              : framesPerClip
          }
        >
          <Loop durationInFrames={framesPerClip}>
            <OffthreadVideo
              src={clipPath}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
              volume={0}
            />
          </Loop>
        </Sequence>
      ))}

      {/* Layer 2: TTS Audio */}
      {audioPath && <Audio src={audioPath} volume={1} />}

      {/* Layer 3: Background music */}
      {bgMusicPath && <Audio src={bgMusicPath} volume={0.08} />}

      {/* Layer 4: Subtitles */}
      {useSubtitles !== false && phraseGroups && phraseGroups.length > 0 && (
        <Subtitles phraseGroups={phraseGroups} />
      )}

      {/* Layer 5: Outro */}
      {outroPath && outroDurationFrames > 0 && (
        <Sequence from={mainDurationFrames} durationInFrames={outroDurationFrames}>
          <AbsoluteFill>
            <OffthreadVideo
              src={outroPath}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
              volume={0}
            />
            {outroAudioPath && (
              <Audio src={outroAudioPath} volume={1} />
            )}
          </AbsoluteFill>
        </Sequence>
      )}
    </AbsoluteFill>
  );
};
