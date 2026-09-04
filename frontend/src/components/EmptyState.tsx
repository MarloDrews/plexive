// The empty state, built from the interface build specification.
//
// It paints nothing. No card, no fill, no rule, no box, no background: the
// surface behind it is whatever the page already puts there, and this component
// only positions the block on it. That is the whole point of the specification,
// so any background added here later is a change to the specification and not a
// tidy-up.
//
// The block's CENTRE sits at 38 per cent of the available height, not its top
// edge, which is why it is absolutely positioned and pulled back by half its own
// height rather than laid out with a flex offset. The component therefore needs a
// parent with a real height; the feed gives it h-full.
//
// The control is optional. When it is absent the state is the mark and one line,
// which is what the feed uses.

import CompassMark from "@/components/CompassMark"

interface Props {
  copy: string
  action?: { label: string; onClick: () => void }
}

export default function EmptyState({ copy, action }: Props) {
  return (
    <div className="relative h-full w-full">
      {/* gap-4 is the 16px the specification puts under the mark and, when a
          control is present, under the copy as well. Both gaps are the same
          number, so one gap states both. */}
      <div className="absolute left-1/2 top-[38%] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-4">
        <CompassMark />
        <p className="font-sans text-[17px] font-normal text-ink text-center">{copy}</p>
        {action ? (
          // 40px tall stated as arithmetic rather than asserted with a fixed
          // height: 22px line box + 8px padding twice + 1px rule twice = 40.
          // The rule is the only thing hover moves, because the ink is already
          // at the top of the ramp and there is no fill to change.
          <button
            type="button"
            onClick={action.onClick}
            className="inline-flex items-center justify-center rounded-[4px] border border-edge-strong px-4 py-2 font-sans text-[15px] font-medium leading-[22px] text-ink hover:border-edge-emphasis"
          >
            {action.label}
          </button>
        ) : null}
      </div>
    </div>
  )
}
