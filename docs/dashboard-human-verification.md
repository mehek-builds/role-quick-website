# Dashboard human verification

While an original managed Send is still running, the applications progress screen can show a supported employer challenge inside Litos. The backend resolves the current owned packet and original execution. The client never receives provider credentials, a new submission capability or arbitrary browser controls.

The image and every input carry the same attempt, frame and geometry revision. Only explicit user pointer, focus, keyboard or text actions are sent. Commands are ordered. Consecutive pending moves may coalesce, but down/up do not. An unconfirmed command clears the queue and requires an explicit refresh of settled state; refresh never replays input. Original expiration and final submission verification remain server-controlled.

The feature requires the corresponding backend and local Stratus human-channel releases before deployment. It cannot revive an old terminal application or establish receipt by itself. Litos still needs the employer acknowledgment for the original attempt.

## Accessibility and interaction

The section has a programmatic name and description. Its status message changes only when the challenge opens or closes. Errors use an alert. Focus stays where the applicant put it; polling does not move focus. Standard Litos buttons preserve visible focus, at least 44-pixel height and normal Tab navigation. The collapsible keyboard controls send only selected keys to the challenge after the explicit Enter challenge action. They do not intercept the user's browser shortcuts or trap focus. No custom animation is introduced.

The third-party challenge is delivered as an image, so its internal DOM is not readable to a screen reader through this channel. This is a known accessibility limitation, not a claim of full WCAG conformance for third-party challenges. VoiceOver/Safari and NVDA/Firefox manual testing has not been performed in this environment. No audio relay is provided by this image/input channel.

The browser regression runs the actual production dashboard build at 1280 and 320 CSS pixels with synthetic images and backend responses. It verifies scaled drag input, explicit keyboard controls, one browser tab, no new application request, lost-acknowledgment handling and no input replay. All external requests are aborted. The source queues also have expiry, stale-frame, sequence, cancellation and teardown tests.

Run `npm test`, `npm run build` and `npm run test:human-verification`. The browser test is included in CI. Synthetic tests do not prove a live employer acceptance.
