import React from 'react';

type FrameDimensions = {
  width: number;
  height: number;
};

type Renderer = <Props>() => React.ReactElement<Props>;

type Frame = {
  label: string;
  renderer: Renderer;
  sizes: FrameDimensions[];
};

let frames: Frame[] = [];

export function frame(
  label: string,
  renderer: Renderer,
  sizes: FrameDimensions[] = []
) {
  frames.push({ label, sizes, renderer });
}

frame.all = () => frames;

frame.clear = () => (frames = []);
