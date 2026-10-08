// Fixed starter links for onboarding step 2 (docs/onboarding-wizard.md decision 5). Code constants only.

/** @typedef {{ label: string, domain: string, url: string, defaultChecked: boolean, backgroundColor?: string, backgroundColorSource?: "manual" | "auto" }} OnboardingStarter */

/** @type {readonly OnboardingStarter[]} */
export const ONBOARDING_STARTER_LINKS = Object.freeze([
  { label: "ChatGPT", domain: "chatgpt.com", url: "https://chatgpt.com/", defaultChecked: true, backgroundColorSource: "auto" },
  { label: "YouTube", domain: "youtube.com", url: "https://www.youtube.com/", defaultChecked: true, backgroundColorSource: "auto" },
  { label: "X", domain: "x.com", url: "https://x.com/", defaultChecked: true, backgroundColorSource: "auto" },
  { label: "GitHub", domain: "github.com", url: "https://github.com/", defaultChecked: false, backgroundColorSource: "auto" },
  {
    label: "Gmail",
    domain: "mail.google.com",
    url: "https://mail.google.com/",
    defaultChecked: false,
    backgroundColor: "#1a73e8",
    backgroundColorSource: "manual"
  },
  { label: "Spotify", domain: "open.spotify.com", url: "https://open.spotify.com/", defaultChecked: false, backgroundColorSource: "auto" },
  { label: "Reddit", domain: "reddit.com", url: "https://www.reddit.com/", defaultChecked: false, backgroundColorSource: "auto" },
  { label: "Amazon", domain: "amazon.com", url: "https://www.amazon.com/", defaultChecked: false, backgroundColorSource: "auto" }
]);
