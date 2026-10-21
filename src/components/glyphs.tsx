import type * as React from "react";
import type { Base } from "@/lib/types";

// Small music glyphs drawn for the 24×24 icon grid, filled with the text color.

type GlyphProps = React.SVGProps<SVGSVGElement>;

function Glyph({ children, ...props }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden {...props}>
      {children}
    </svg>
  );
}

const HEAD = "M8.6 17.2c-1.6.9-3.3.8-3.9-.2-.6-1 .3-2.6 1.9-3.5 1.6-.9 3.3-.8 3.9.2.6 1-.3 2.6-1.9 3.5Z";

function OpenHead() {
  return (
    <path
      fillRule="evenodd"
      d={`${HEAD}M9.6 14.4c-.3-.5-1.4-.4-2.6.3-1.2.7-1.9 1.6-1.6 2.1.3.5 1.4.4 2.6-.3 1.2-.7 1.9-1.6 1.6-2.1Z`}
    />
  );
}

export function NoteGlyph({ base, ...props }: GlyphProps & { base: Base }) {
  if (base === 1)
    return (
      <Glyph {...props}>
        <path
          fillRule="evenodd"
          d="M12 15.9c-3.2 0-5.6-1.3-5.6-3s2.4-3 5.6-3 5.6 1.3 5.6 3-2.4 3-5.6 3Zm-1.6-5.2c-1 .3-1.4 1.3-.9 2.4.5 1.1 1.8 1.8 2.9 1.5 1-.3 1.4-1.3.9-2.4-.5-1.1-1.8-1.8-2.9-1.5Z"
        />
      </Glyph>
    );
  return (
    <Glyph {...props}>
      {base === 2 ? <OpenHead /> : <path d={HEAD} />}
      <rect x="9.6" y="3.2" width="1.3" height="13" rx=".4" />
      {base >= 8 && <path d="M10.9 3.2c.3 2.1 1.6 3.2 3 4.4 1.5 1.3 2.4 3 1.5 5.6.6-2-.5-3.4-2-4.4-1-.7-2-1.2-2.5-1.6Z" />}
      {base === 16 && <path d="M10.9 7.2c.3 2 1.6 3 3 4.2 1.4 1.2 2.3 2.8 1.5 5.2.5-1.8-.5-3.2-2-4.2-1-.6-2-1.1-2.5-1.5Z" />}
    </Glyph>
  );
}

export function DotGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d={HEAD} />
      <rect x="9.6" y="3.2" width="1.3" height="13" rx=".4" />
      <circle cx="15.4" cy="15.4" r="2" />
    </Glyph>
  );
}

export function RestGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M10.2 3.4 14.6 8.6c-1.4 1.3-2 2.4-1.6 3.8l2.6 3.4c-1.6-.6-3.2-.5-3.9.4-.6.8-.3 2.1.8 3.4-2.1-1.1-3.4-3-2.6-4.4.6-1 2-1.3 3.1-1L9.8 10c1.3-1.2 2.1-2.4 1.6-3.7L9.6 4Z" />
    </Glyph>
  );
}

export function SharpGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <rect x="9" y="3.5" width="1.4" height="17" rx=".4" />
      <rect x="13.6" y="2.8" width="1.4" height="17" rx=".4" />
      <path d="M6.5 10.6 17.5 7.4v2.4L6.5 13Zm0 5.4 11-3.2v2.4l-11 3.2Z" />
    </Glyph>
  );
}

export function FlatGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <rect x="8.6" y="2.5" width="1.4" height="18" rx=".4" />
      <path
        fillRule="evenodd"
        d="M10 12.6c1.9-1.6 4.6-2 5.6-.6 1 1.5-.4 3.6-2.4 5.4L10 20.5v-2.2l2.5-2.3c1.6-1.5 2.3-2.6 1.8-3.3-.5-.8-2.4-.4-4.3 1.2Z"
      />
    </Glyph>
  );
}

export function NaturalGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <rect x="8.4" y="2.5" width="1.4" height="14" rx=".4" />
      <rect x="14.2" y="7.5" width="1.4" height="14" rx=".4" />
      <path d="M8.4 9.6 15.6 7.6v2.4L8.4 12Zm0 5.4 7.2-2v2.4l-7.2 2Z" />
    </Glyph>
  );
}

export function TieGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d={HEAD} transform="translate(-2.2 -1)" />
      <path d={HEAD} transform="translate(8.6 -1)" />
      <path d="M5 11.4c3.6-3.4 10.4-3.4 14 0-3.8-2.3-10.2-2.3-14 0Z" />
    </Glyph>
  );
}

export function RepeatStartGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <rect x="4" y="4" width="3" height="16" rx=".5" />
      <rect x="9" y="4" width="1.2" height="16" rx=".4" />
      <circle cx="14" cy="9.5" r="1.7" />
      <circle cx="14" cy="14.5" r="1.7" />
    </Glyph>
  );
}

export function RepeatEndGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <rect x="17" y="4" width="3" height="16" rx=".5" />
      <rect x="13.8" y="4" width="1.2" height="16" rx=".4" />
      <circle cx="10" cy="9.5" r="1.7" />
      <circle cx="10" cy="14.5" r="1.7" />
    </Glyph>
  );
}
