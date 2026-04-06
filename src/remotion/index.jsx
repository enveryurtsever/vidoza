import React from "react";
import { registerRoot, Composition } from "remotion";
import { ShortVideo } from "./ShortVideo";

const RemotionRoot = () => {
  return (
    <Composition
      id="ShortVideo"
      component={ShortVideo}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={900}
      defaultProps={{
        mediaPaths: [],
        audioPath: "",
        bgMusicPath: null,
        phraseGroups: [],
        outroPath: null,
        outroDurationFrames: 0,
        mainDurationFrames: 900,
      }}
    />
  );
};

registerRoot(RemotionRoot);
