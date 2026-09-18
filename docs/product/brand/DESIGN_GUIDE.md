# Toffee Fan App — Design Guide

> **Purpose**  
> This file is the implementation reference for the Toffee fan app UI.  
> The attached reference images are **approved directions**. Do not reinterpret them into a new visual style unless explicitly requested.

---

## 0. Core Product Definition

**Toffee** is a paid subscription fandom messaging platform that connects fans and actors through 1:1-style DM experiences.

### Core business rule
- There is **no free subscription tier**.
- There is **no free DM access**.
- A fan must have an **active paid subscription** to message an actor.
- A user may subscribe to **multiple actors at the same time**.

### Asymmetric messaging permissions

**Fan can send**
- Text
- Emoji

**Actor can send**
- Text
- Photo
- Voice
- Video

This asymmetry is a core product behavior and must be preserved in the UI.

### Localization
Initial target languages:
- Thai
- English

The UI must be designed so additional languages can be added later without breaking layouts.

---

# 1. Brand Direction

## Approved reference
`01_brand_A_original.png`

## Brand name
**Toffee**

## Main slogan
**Closer to what matters**

## Approved visual direction
- Soft Sans wordmark
- T Spark symbol
- Black + Lavender
- White base
- Clean
- Modern
- Premium
- Intimate
- Global

## Important constraints
Do **not** reinterpret Toffee as:
- Brown
- Caramel
- Dessert-like
- Cute candy branding
- Soft pastel-heavy branding

The name “Toffee” is treated as a brand name, not as a literal visual direction.

## T Spark
The T Spark is a small brand accent.

Do:
- Use it as a restrained signature detail.
- Keep it recognizable at app-icon scale.

Do not:
- Turn it into a decorative pattern.
- Scatter sparkles throughout the UI.
- Make it cute, magical, or ornamental.

---

# 2. Navigation / IA

## Bottom navigation

Use exactly 3 tabs:

1. **Discover**
2. **Inbox**
3. **Profile**

Do **not** add a Home tab.

## Default entry behavior

### User has no active subscriptions
Open:
**Discover**

### User has at least one active subscription
Open:
**Inbox**

The core user flow is:

`Discover → Actor Profile → Subscribe → Inbox → Chat`

Profile is used for account and subscription management.

---

# 3. Onboarding

## Approved reference
`02_onboarding_03_fandom_welcome.png`

## Direction
**Fandom Welcome**

## Goal
The user should quickly understand:
1. They can discover actors.
2. They can subscribe to an actor.
3. Subscription unlocks DM access.
4. Actors can send photo / voice / video messages.
5. The service is paid.

## Visual feeling
- Exciting
- Fan-oriented
- Welcoming
- Still polished and premium

## Avoid
- Excessive cuteness
- Game-like UI
- Too many stickers
- Heavy decoration
- Childish fandom visuals

---

# 4. Discover

## Approved reference
`03_discover_03_fandom_discovery.png`

## Direction
**Fandom Discovery**

## Required elements
- Search bar
- For You
- Trending
- New
- Actor cards
- Actor profile navigation

## Goal
Help the user find an actor they may want to subscribe to.

## Important
This is **not** a social feed.

Do not turn Discover into:
- A post feed
- A community timeline
- A Weverse-style content feed
- A media consumption page

Actor discovery is the primary task.

---

# 5. Actor Profile / Subscription

## Visual reference
`04_profile_hybrid_selected.png`

Use this image for **overall visual direction only**.

## Important final product decisions
Remove:
- Latest posts
- Latest conversations
- Recent content feed
- Social-feed sections

The final screen should contain only:

### Actor information
- Hero image
- Actor name
- Verified badge
- Short description

### Subscription information
- Monthly price
- Billing cycle
- Benefits
- Subscription CTA

## CTA
**Subscribe to Message**

## Benefits
Use an **icon list**.

Recommended benefit labels:
- DM access
- Photo messages
- Voice messages
- Video messages
- Special updates

## Important
There is no free option.

Do not show:
- Free tier
- Free trial by default
- Upgrade plan
- Premium tier comparison

The paid subscription is the standard entry point to DM.

---

# 6. Subscription Checkout

## Approved reference
`08_payment_P2_actor_focused.png`

## Direction
**P-2 Actor-focused Subscription**

## Flow

`Actor Profile`
→ `Subscribe to Message`
→ `Subscription Confirm`
→ `Payment`
→ `Subscription Complete`
→ `Start Messaging`

## Subscription Confirm

Required:
- Actor image
- Actor name
- Subscription price
- Billing cycle
- Included benefits
- Auto-renewal information
- Final Subscribe CTA

The actor should remain visually prominent.

Do not make this screen feel like a generic ecommerce checkout.

---

# 7. Subscription Complete

The completion moment should feel like the start of a closer connection, not a receipt page.

## Recommended copy

**You're closer now.**

Supporting copy example:
`Your subscription to [Actor Name] is active.`

## CTA
**Start Messaging**

The CTA should take the user directly to that actor's chat.

A restrained T Spark moment or lavender emphasis may be used here.

---

# 8. Inbox / Message Home

## Approved reference
`05_inbox_B3_fandom_inbox.png`

## Direction
**B-3 Fandom Inbox**

## Goal
Create the emotional moment:

> “Did my actor send something new?”

## Required
- Actor story-style row at top
- Actor avatar
- Latest message preview
- Timestamp
- Unread state
- Media hint where relevant
  - Photo
  - Voice
  - Video

## Tone
The Inbox may feel more exciting and fan-oriented than the chat itself.

## Avoid
- Excessive badges
- Loud colors
- Too many status pills
- Repeated “Premium” or “Exclusive” labels

All users in this section already understand they are in a paid subscription service.

---

# 9. Chat Detail

## Approved reference
`06_chat_2A_minimal_premium.png`

## Direction
**2A Minimal Premium**

## Goal
The screen should feel as close as possible to a real private DM while maintaining a polished premium product feel.

## Fan permissions

Fan composer supports:
- Text
- Emoji

Do **not** add:
- Photo upload
- Voice upload
- Video upload

## Actor message types
Actor can send:
- Text
- Photo
- Voice
- Video

Actor media should visually stand out without making the chat feel like a content feed.

## UI direction
- Minimal
- Calm
- Intimate
- Premium
- Spacious
- Familiar DM behavior

Avoid excessive branding inside the chat.

---

# 10. Profile

## Direction
**Simple settings-list style**

The Profile screen should remain intentionally simple.

## Do not show
Do not display subscription cards directly on the Profile main screen.

## Menu structure

Recommended:
- Manage Subscriptions
- Notifications
- Language
- Payment Method
- Account Settings
- Help Center
- Terms & Privacy
- Log Out

---

# 11. Manage Subscriptions

## Approved reference
`07_manage_subscriptions_final.png`

## Structure
Use a vertically scrollable list of subscription cards.

The design must support multiple actor subscriptions.

## Each card should include
- Actor image
- Actor name
- Monthly price
- Subscription status
- Next billing date

Selecting a card opens the subscription detail screen.

## Subscription Detail

Recommended:
- Actor name
- Active / canceled status
- Monthly price
- Next billing date
- Payment method
- Auto-renewal information
- Included benefits
- Change payment method
- Cancel subscription

---

# 12. Visual System Rules

These are implementation rules, not a request to redesign the brand.

## Color
Primary visual relationship:
- White
- Black / near-black
- Approved lavender accent

Lavender should be used with restraint.

Do not create a new lavender palette without approval.

## Cards
- Clean
- Restrained radius
- Minimal shadow
- Avoid bubbly / candy-like shapes
- Prioritize hierarchy over decoration

## Buttons
Primary buttons should feel:
- Clear
- Premium
- Simple

Avoid overly pill-shaped or playful CTA styles unless already shown in the reference.

## Typography
Use a clean modern sans-serif direction.

Typography should prioritize:
- High legibility
- Clear hierarchy
- Good multilingual behavior

Thai and English must both fit comfortably.

## Icons
- Simple
- Consistent stroke / weight
- Minimal decoration
- No cute illustration style

---

# 13. Reference Image Mapping

Use these files intentionally.

| File | Purpose |
|---|---|
| `01_brand_A_original.png` | Brand / logo / overall visual anchor |
| `02_onboarding_03_fandom_welcome.png` | Onboarding reference |
| `03_discover_03_fandom_discovery.png` | Discover reference |
| `04_profile_hybrid_selected.png` | Actor profile visual reference only |
| `05_inbox_B3_fandom_inbox.png` | Inbox reference |
| `06_chat_2A_minimal_premium.png` | Chat detail reference |
| `07_manage_subscriptions_final.png` | Subscription management reference |
| `08_payment_P2_actor_focused.png` | Checkout / subscription reference |

---

# 14. AI Coding Tool Instructions

When using Cursor, Claude Code, Codex, or another coding assistant:

## Recommended workflow

Do **not** attach every image for every task.

For each screen, provide:
1. `01_brand_A_original.png`
2. The reference image for the screen being implemented
3. This `DESIGN_GUIDE.md`

Example:

### Implementing Discover
Attach:
- `01_brand_A_original.png`
- `03_discover_03_fandom_discovery.png`
- `DESIGN_GUIDE.md`

### Implementing Chat
Attach:
- `01_brand_A_original.png`
- `06_chat_2A_minimal_premium.png`
- `DESIGN_GUIDE.md`

This reduces visual mixing and unwanted reinterpretation.

---

# 15. Reusable Coding Prompt

Use this prompt when implementing a screen:

```text
You are implementing the Toffee fan app.

Read DESIGN_GUIDE.md first.

The attached reference image is an approved visual direction.
Do not redesign or reinterpret it into a different style.

Your priorities are:

1. Preserve the reference layout and visual hierarchy.
2. Preserve the approved Toffee brand direction.
3. Reuse the existing project architecture and components where appropriate.
4. Make only the changes required for real functionality and responsive behavior.
5. Do not add UI elements that are not required by the product specification.
6. Do not invent a new color palette, new brand style, or decorative system.
7. If a technical constraint requires a visible design change, explain the conflict before changing the UI.

Implement this screen as production-quality UI.
```

---

# 16. Screen-Specific Prompt Example

## Chat Detail

```text
Implement the Toffee Chat Detail screen.

References:
- 01_brand_A_original.png
- 06_chat_2A_minimal_premium.png
- DESIGN_GUIDE.md

Use the 2A Minimal Premium direction.

Functional constraints:
- Fan can send only text and emoji.
- Fan cannot upload photo, voice, or video.
- Actor can send text, photo, voice, and video.
- The UI should feel like a real private DM, not a social feed.
- Actor media content may stand out, but branding should remain restrained.
- Do not add Premium or Exclusive badges unless functionally necessary.

Match the approved reference as closely as practical while using the project's existing navigation, design tokens, and component architecture.
```

---

# 17. Non-Negotiable Rules

Before creating or modifying a Toffee screen:

1. Check whether an approved reference image exists.
2. Use that image as the primary visual reference.
3. Check this guide for final product decisions that were made after the image was generated.
4. Preserve the existing brand direction.
5. Do not introduce a new style without explicit approval.

If the reference image and this document conflict:

**This document takes precedence for product behavior and final requirements.**

The image remains the visual reference.

---

# Toffee

**Closer to what matters**
