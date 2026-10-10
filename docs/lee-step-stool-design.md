# Lee Step Stool

Source: `models/lee-step-stool/reference/design.png`, the user-supplied illustrated design sheet. The sheets are design evidence, not engineering or tested fabrication plans. The follow-up rounded-letter sheet is preserved as `models/lee-step-stool/reference/rounded-letters.png`.

Source SHA-256: `64dea512e5be2049d63c01a3ba3614adcbd6fa8668c5460ba253ef8e40002e6d`.

Rounded-letter source SHA-256: `835294c8ce50f69b3432141ec91238fa078d2f3f89b5ee7b2489fbe512e57f6a`.

## Evidence brief

Coordinate frame: X runs along the 12.5-inch top, Y across the 9.5-inch top, Z vertically from the floor. Letters read from the front (negative Y). Top and four leg centers are fixed datums; each loose letter can lift vertically from its pocket. There is no router mechanism or adjustable hardware in this design.

| Part | Role and mating surface | State / motion | Evidence / confidence |
| --- | --- | --- | --- |
| Sycamore top | Rounded rectangular platform; blind letter pockets and four through leg sockets | Fixed | Material, footprint, thickness stated / high |
| Four cherry legs | Cylinders through top, flush at upper surface | Fixed after assembly | Diameter stated; through joinery visible in details / high |
| L, E, E inserts | Blue wooden letters resting on blind pocket floors | Independent vertical removal | Color, rounded outlines, approximate depth and removal lip stated / high |
| Finger wells | Semicircular access outside lower letter edge | Fixed pocket feature | Visible in top and detail / medium |
| Flush caps | Cherry end grain at leg centers | Integrated leg ends in model | Image calls these plugs/caps but also says legs run through top / medium |

Observed dimensions: top 12.5 × 9.5 × 1.5 inches; leg diameter 1 inch; exposed legs 7–8 inches; letters approximately 1 inch deep. The initial model used the midpoint leg height of 7.5 inches. The user subsequently requested 5–6-inch clearance, 1.5–2-inch leg diameters, playful rounded letters and easier horizontal layout adjustments. Revised defaults use 6-inch floor-to-underside clearance and 1.5-inch legs, giving 7.5 inches overall; the 1-inch pocket/letter depth remains. Clearance supports 4–8 inches and diameter supports 1–2 inches.

Assumed, editable defaults: 0.5-inch plan corner radius, 0.125-inch edge roundover, 33.9 mm (approximately 1.33-inch) leg-center setback, 3.25-inch letter height, independent 2-inch letter width, 1-inch horizontal letter gap, a 1.5-inch minimum wood border and 0.8 mm letter fit clearance per side, 0.15 mm leg socket clearance per side, and a 0.4-inch finger-well radius. Letter height and width are independent; the latest user revision uses modern rounded sans-serif outlines with no serifs. Stroke and corner proportions scale with those dimensions. The rendered top uses an approximate sycamore grain; figure varies by board.

Constraints: total height = exposed leg height + top thickness; leg blank length = total height; pocket floor thickness = top thickness − letter depth. Letter layout is centered, with group width = three letter widths + two edge-to-edge horizontal gaps. Setbacks keep leg sockets inside the rounded top. Layout controls preserve the selected minimum wood border and at least 3.175 mm of wood between pocket bounds and corner sockets. Socket separation uses both X and Y distances so wider legs do not unnecessarily compress the letter group into a narrow X-only strip. Extreme settings normalize size and gap controls to the available space. Flush letters have a gap only around their sides. Finger wells share the pocket floor. The top mesh has real blind recesses and real through holes rather than overlaid decorations.

Unresolved source details: glue/tenon retention, exact plug construction, grain orientation, finish, fit after finishing and load rating. The model represents continuous through legs, with flush ends; it does not invent separate caps or hidden fasteners. It is a design/fabrication model, with no certified load rating.

Verification views: assembled top oblique for color and letters; top for three outlines, wells and four caps; bottom/side for through legs and top thickness; removed letters for blind floors; individual top and letter export topology. The source is illustrative and leaves several dimensions inferred, so this is reference-matched, not a measured 1:1 reconstruction.


## Controls and fabrication parity

The inspector begins with Letter layout: height, width, horizontal gap and minimum wood border. The Legs section follows with clearance/diameter sliders and 5, 6, 7.5-inch clearance presets plus 1, 1.5, 2-inch diameter presets. Assembly and exports are in an expandable section; detailed top/fit settings follow. Pocket fit clearance remains distinct from the wood border. Geometry, assembled/exploded previews, registered and individual STLs, and the SVG all use the same rounded sans-serif letter contours and effective dimensions.
