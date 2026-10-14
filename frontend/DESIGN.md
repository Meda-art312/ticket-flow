---
name: TicketFlow
description: Muted editorial event guide with clear transactional controls and perforated ticket geometry.
colors:
  accent: "#344f9d"
  accent-hover: "#253c7d"
  danger: "#8d302d"
  danger-hover: "#6f2421"
  ground: "#eeece5"
  paper: "#f8f7f2"
  ink: "#242822"
  muted: "#60665c"
  line: "#d3d5ca"
  field-border: "#7d8675"
  field-border-hover: "#697660"
  field-border-disabled: "#b7bcae"
  field-disabled: "#e4e5dc"
  field-placeholder: "#697061"
  secondary-border: "#9fa696"
  secondary-hover: "#e1e3d8"
  search-surface: "#e2e4d9"
  selected-surface: "#e9edf5"
  badge-neutral-surface: "#dfe3ec"
  badge-neutral-ink: "#34476b"
  badge-positive-surface: "#dae4d5"
  badge-positive-ink: "#304d2d"
  badge-negative-surface: "#eadbd4"
  badge-negative-ink: "#7e342e"
  poster-navy: "#344878"
  poster-navy-ink: "#f4efde"
  poster-clay: "#805a49"
  poster-clay-ink: "#f1e7d6"
  poster-sage: "#b5bd9e"
  poster-sage-ink: "#2e3b2c"
  poster-ochre: "#d6c286"
  poster-ochre-ink: "#463a27"
typography:
  display:
    fontFamily: '"Bricolage Grotesque Variable", sans-serif'
    fontSize: "clamp(3.5rem, 6.1vw, 5.5rem)"
    fontWeight: 650
    lineHeight: 1.015
    letterSpacing: "-0.04em"
  page-title:
    fontFamily: '"Bricolage Grotesque Variable", sans-serif'
    fontSize: "clamp(2.4rem, 4.4vw, 4rem)"
    fontWeight: 650
    lineHeight: 1.12
    letterSpacing: "-0.025em"
  headline:
    fontFamily: '"Bricolage Grotesque Variable", sans-serif'
    fontSize: "1.75rem"
    fontWeight: 650
    lineHeight: 1.12
    letterSpacing: "-0.025em"
  title:
    fontFamily: '"Bricolage Grotesque Variable", sans-serif'
    fontSize: "1.25rem"
    fontWeight: 650
    lineHeight: 1.12
    letterSpacing: "-0.025em"
  body:
    fontFamily: '"Manrope Variable", sans-serif'
    fontSize: "1rem"
    fontWeight: 450
    lineHeight: 1.65
  label:
    fontFamily: '"Manrope Variable", sans-serif'
    fontSize: "0.83rem"
    fontWeight: 650
  button:
    fontFamily: '"Manrope Variable", sans-serif'
    fontSize: "0.875rem"
    fontWeight: 650
    lineHeight: 1.4
  poster:
    fontFamily: '"Bricolage Grotesque Variable", sans-serif'
    fontSize: "clamp(1.7rem, 2.8vw, 2.8rem)"
    fontWeight: 600
    lineHeight: 1.03
    letterSpacing: "-0.035em"
rounded:
  badge: "6px"
  field: "7px"
  control: "8px"
  option: "9px"
  inset: "10px"
  search: "12px"
  content: "14px"
  statement: "16px"
  circle: "50%"
spacing:
  "8": "8px"
  "10": "10px"
  "12": "12px"
  "14": "14px"
  "16": "16px"
  "18": "18px"
  "20": "20px"
  "22": "22px"
  "24": "24px"
  "26": "26px"
  "28": "28px"
  "30": "30px"
  "32": "32px"
  "36": "36px"
  "40": "40px"
  "48": "48px"
  "80": "80px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.paper}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "12px 22px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "12px 22px"
  button-secondary-hover:
    backgroundColor: "{colors.secondary-hover}"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.paper}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "12px 22px"
  button-danger-hover:
    backgroundColor: "{colors.danger-hover}"
  button-text:
    backgroundColor: "transparent"
    textColor: "{colors.accent}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "8px 0"
  button-icon:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.circle}"
    height: "44px"
    width: "44px"
  field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "12px 14px"
  field-disabled:
    backgroundColor: "{colors.field-disabled}"
    textColor: "{colors.muted}"
  navigation:
    textColor: "{colors.muted}"
  badge-neutral:
    backgroundColor: "{colors.badge-neutral-surface}"
    textColor: "{colors.badge-neutral-ink}"
    rounded: "{rounded.badge}"
    padding: "7px 10px"
  badge-positive:
    backgroundColor: "{colors.badge-positive-surface}"
    textColor: "{colors.badge-positive-ink}"
    rounded: "{rounded.badge}"
    padding: "7px 10px"
  badge-negative:
    backgroundColor: "{colors.badge-negative-surface}"
    textColor: "{colors.badge-negative-ink}"
    rounded: "{rounded.badge}"
    padding: "7px 10px"
  event-card:
    textColor: "{colors.ink}"
  poster:
    backgroundColor: "{colors.poster-navy}"
    textColor: "{colors.poster-navy-ink}"
    rounded: "{rounded.content}"
    padding: "22px"
  receipt:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.content}"
    padding: "30px 36px"
---

# Design System: TicketFlow

## Overview

**Creative North Star: "The Editorial Event Guide"**

TicketFlow uses the quiet material language of an independent cultural guide: warm bone ground, paper panels, dark ink and deliberate cobalt. Expressive type and geometric ticket artwork give events personality; navigation and transactional forms stay familiar and direct. The user-confirmed atmosphere is muted and not too bright.

The implemented system is code-led. It uses circles, rotated SVG ticket emblems and dashed perforations rather than supplied event photography. Event artwork carries real title, category and date, while readable metadata remains outside the art. Receipts and admission tickets repeat the perforated rhythm with less ornament; organizer work uses modest forms, rows and tables.

**Key Characteristics:**

- Warm bone and paper surfaces with restrained cobalt emphasis.
- Self-hosted expressive Bricolage Grotesque paired with clear Manrope.
- Geometric event posters and perforated ticket dividers.
- Familiar controls, visible focus and responsive content containment.
- Flat tonal panels with selective ticket and dialog elevation.

This is a source extraction from `src/styles.css`, `src/components/ui.tsx`, `src/components/Shell.tsx` and the font imports in `src/main.tsx`, reconciled with `PRODUCT.md` and `docs/design-direction.md`. `docs/design-review.md` records ship for four resolved material fixes; it does not establish a whole-surface audit.

## Colors

The palette puts warm neutral surfaces around deep, controlled color; the frontmatter contains the normative values. The sidecar's tonal strips are synthesized previews, not an additional shipped color scale.

### Primary

- **Deep Cobalt** (`accent`): primary actions, inline actions, focus outlines, selected category boundaries and the emphasized discovery-title line. `accent-hover` darkens filled primary actions.
- **Brick Danger** (`danger`): destructive filled actions and destructive text, with a darker destructive hover.

### Secondary

- **Poster Navy, Clay, Sage and Ochre** (`poster-*`): the four authored event-art variants, each with its own paired foreground. These belong to event artwork rather than general control chrome.

### Neutral

- **Muted Bone** (`ground`): the continuous application ground.
- **Warm Paper** (`paper`): inputs, reservation and editor panels, receipts, checkout cards, admission tickets and dialogs.
- **Dark Ink** (`ink`): primary text and active navigation. **Soft Olive Ink** (`muted`): supporting copy, secondary metadata and navigation at rest.
- **Paper Divider** (`line`): ordinary rules between sections, rows and table cells.
- **Active Field Olive** (`field-border`) and its darker hover: actionable input boundaries. The disabled border and disabled surface are separately subdued; their values must not replace the active boundary.
- **Search Surface** and **Selected Surface**: quiet tonal grouping for search controls and the chosen reservation category.
- **Status pairs**: neutral blue, positive sage and negative clay surfaces with their paired foregrounds. Status text remains visible; the color does not replace the label.

The increased-contrast media query strengthens muted text, dividers and control borders and outlines badges. Those preference-specific overrides remain in the source and are not default palette replacements.

## Typography

**Display Font:** Bricolage Grotesque Variable, with sans-serif fallback.  
**Body Font:** Manrope Variable, with sans-serif fallback.

Both fonts are self-hosted through the imported Fontsource packages. The broad display grotesque makes headings and ticket art distinctive; Manrope keeps forms and dense metadata easy to scan. The type ramp is role-based, with responsive clamps and component-specific sizes rather than a fixed modular ratio.

### Hierarchy

- **Display:** the discovery heading uses the `display` token, balanced wrapping and a tight line. At the tablet/mobile breakpoint it changes to `clamp(3.3rem, 9vw, 4.5rem)`; at the narrow breakpoint it is `3.3rem`.
- **Page title:** the global first-level heading uses `page-title`; event, authentication, checkout and admission surfaces make local size adjustments in the stylesheet.
- **Headline:** the global second-level heading uses `headline`.
- **Title:** the global third-level heading uses `title`; event-card titles adjust with the collection layout.
- **Body:** ordinary paragraphs use the `body` role and generous leading. Event descriptions stop at `70ch`; ticket-aside copy stops at `40ch`.
- **Label:** form labels and legends use the `label` role with an `8px` label-to-field gap. Helper text drops to regular weight and muted ink.
- **Button:** controls use the compact, semibold `button` role.
- **Poster:** event titles use the `poster` role, balanced wrapping and `overflow-wrap: anywhere`. Category/date metadata uses small uppercase Manrope; this is event information rather than a marketing eyebrow.

Prices, pagination, receipt values and table values use tabular numerals. There is no separate mono face.

## Layout

Header, main and footer share a centered maximum width (`1440px`) and fluid inline gutters (`clamp(22px, 5.55vw, 80px)`). The desktop masthead is `104px` high. Main content starts with `36px` top padding and ends with `80px` bottom padding.

The collection is three equal, shrinkable columns with `28px` column gaps and `42px` row gaps. The layout reduces to two columns at `760px` and one at `450px`. At `1050px`, density and gaps tighten. At `760px`, navigation moves to its own row, search fills the row, filters stack, detail and organizer panels become one column and sticky side panels become static. At `450px`, the two-column form grid also stacks. The `1600px` minimum-width query retains the `80px` outer gutter.

Spacing uses repeated even steps recorded in the frontmatter; it is not an imposed eight-point grid. Paper panels generally use `30px` padding on desktop and `24px` in narrower layouts. Receipts use wider horizontal padding, and dialogs use their own larger inset. Forms and tables are workmanlike rather than decorative dashboards; tables scroll horizontally when needed.

At narrow widths, event posters keep `width: 100%`, `min-width: 0`, an automatic aspect ratio and a content-driven minimum height (`280px`). Titles do not shrink away or truncate to preserve a fixed artwork box. Standard filled buttons and fields have a `48px` minimum height; compact buttons, icon buttons, back links, main navigation links and interactive brand links have at least `44px` hit height. Small radio indicators sit inside selectable category labels.

## Elevation & Depth

Most surfaces have no shadow. Bone-to-paper layering, restrained tinted panels and fine rules establish grouping. Admission tickets have a low ambient shadow (`0 12px 24px #28342610`); confirmation dialogs have a stronger modal shadow (`0 22px 70px #101d2930`) and a translucent ink backdrop (`#2028227a`). These are selective roles, not a general card-shadow treatment.

The brief route reveal uses a `5px` upward settle and a small clip reveal over `0.45s`, with the shared easing `cubic-bezier(0.16, 1, 0.3, 1)`. Button background/color transitions last `0.15s`; poster hover brightening lasts `0.2s`. The stylesheet removes animation and transitions and restores automatic scrolling for reduced motion. Content is visible by default.

## Shapes

Controls are gently curved, with the field radius (`7px`) distinct from the button radius (`8px`). Status badges are tighter (`6px`); category options use `9px`; the search group and ticket links use `12px`; ordinary content panels and event posters use `14px`. Admission tickets, checkout and confirmation dialogs use `16px`. Circular icon buttons remain circular.

The ticket signature is geometric: a low-opacity circle crosses the poster edge, a dashed vertical line suggests a stub, and the SVG ticket emblem rotates. Receipt and admission separators translate that gesture into fine dashed rules. Dashed lines have a defined ticket role; ordinary lists and tables use solid rules.

## Components

### Buttons

Clear, compact controls carry familiar web actions. Filled primary and danger buttons pair their role color with paper text; secondary buttons use ink, a transparent ground and an olive boundary. All share the control radius and standard padding recorded above. The compact variant changes padding to `10px 18px`, then `10px 14px` below the narrow breakpoint. Full-width is a layout modifier.

Primary and danger hovers darken; secondary hover adds a quiet neutral fill. Text buttons underline on hover. Icon buttons use a circular `44px` target and a neutral hover fill. Disabled buttons use a not-allowed cursor and half opacity. Keyboard focus uses the global cobalt outline (`3px`, offset `4px`). SVG arrows and icons come from Lucide; the equivalent back links share ArrowLeft.

### Chips

Status badges are noninteractive labels with the neutral, positive or negative pair, tight radius and compact padding recorded above. Their text is capitalized and they do not truncate. Backend state determines the displayed state and tone; booking, payment, refund and ticket status are shown separately.

### Cards / Containers

Event cards are unboxed links: artwork first, date/location metadata, title, supporting copy and a price/action row separated by a fine rule. Hover slightly brightens the poster; keyboard focus outlines the card. Standard reservation and organizer editor panels are warm paper with the content radius and no shadow. Receipt panels share that geometry and add dashed ticket separators. Admission tickets are the selectively lifted statement shape described in Elevation & Depth.

### Inputs / Fields

Fields use paper, ink, the field radius and the active olive boundary. Hover darkens the boundary; focus uses the global cobalt outline and cobalt caret. Disabled fields keep full opacity while switching to their dedicated subdued boundary and surface. Textareas resize vertically.

Labels sit above their controls, helper text stays visible, and errors use the shared alert notice rather than an invented field-error styling system. Search is an integrated field on the search surface; its placeholder uses muted ink, and focus adds a paper background. Category options are labeled radio rows: choosing one adds the selected surface and cobalt boundary.

### Navigation

The masthead uses text links in semibold Manrope, muted at rest, ink plus a two-pixel underline when active and cobalt on hover. The selected page is conveyed independently of hover. On mobile, links wrap into a full-width row while keeping their `44px` hit height. The brand lettering scales separately from its interactive hit area. A visible-on-focus skip link and the main region's route focus support keyboard movement.

### Perforated Event Art and Tickets

Posters combine real event text with the four controlled artwork pairs, an outlined circle, a dashed stub and a Lucide ticket emblem. Their content can grow to preserve the complete title, date and footer. Text outside the decorative art repeats the event information for readable, accessible discovery.

Receipts and admission tickets repeat dashed separators around the transaction or credential. The QR area is white and fits the returned code without clipping. QR SVGs are backend-owned dynamic content; they are not authored illustration assets. There are no shipping bitmap art plates in this system.

## Do's and Don'ts

### Do:

- **Do** use bone as the application ground and paper to group transactional content.
- **Do** pair Bricolage Grotesque headings with Manrope body, labels and controls.
- **Do** preserve complete event titles and date metadata with content-driven poster height.
- **Do** keep active field boundaries distinct from disabled field boundaries.
- **Do** preserve visible cobalt focus, the implemented control hit heights and reduced-motion behavior.
- **Do** use the dashed ticket rhythm on event art, receipts and admission credentials.

### Don't:

- **Don't** brighten the muted editorial palette into a high-saturation application shell.
- **Don't** substitute invented venue photography or invented event data for API event content.
- **Don't** add glass, gradients, faux charts or decorative statistics to this chosen world.
- **Don't** communicate transaction status by color alone or collapse separate backend states into a single outcome.
- **Don't** use the disabled field border as the active field boundary.
- **Don't** replace the shared SVG icon language with Unicode navigation arrows.
