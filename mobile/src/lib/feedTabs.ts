import { type FormatId } from "./formats"

// The feed tabs (Following + For You + Train + Battle + Spotlight). Format-
// specific tabs were removed from the feed; format filtering now lives only in
// the search view. The non-format tabs use a near-white accent so the sliding
// indicator reads neutral on them. Battle and Spotlight are empty placeholder
// tabs for now.

export interface FeedTabDef {
  id: string
  label: string
  format: FormatId | null
  accent: string
  rgb: readonly [number, number, number]
}

// Index of the tab the feed opens on (For You), like the web pager.
export const DEFAULT_TAB_INDEX = 1

export const TABS: FeedTabDef[] = [
  { id: "following", label: "Following", format: null, accent: "#eceeff", rgb: [236, 238, 255] },
  { id: "for-you", label: "For You", format: null, accent: "#eceeff", rgb: [236, 238, 255] },
  { id: "train", label: "Train", format: null, accent: "#eceeff", rgb: [236, 238, 255] },
  { id: "battle", label: "Battle", format: null, accent: "#eceeff", rgb: [236, 238, 255] },
  { id: "spotlight", label: "Spotlight", format: null, accent: "#eceeff", rgb: [236, 238, 255] },
]
