# Lee Step Stool

Source: `models/lee-step-stool/reference/design.png`, the user-supplied illustrated design sheet. The sheet is design evidence, not an engineering or tested fabrication plan.

Source SHA-256: `64dea512e5be2049d63c01a3ba3614adcbd6fa8668c5460ba253ef8e40002e6d`.

## Evidence brief

Coordinate frame: X runs along the 12.5-inch top, Y across the 9.5-inch top, Z vertically from the floor. Letters read from the front (negative Y). Top and four leg centers are fixed datums; each loose letter can lift vertically from its pocket. There is no router mechanism or adjustable hardware in this design.

| Part | Role and mating surface | State / motion | Evidence / confidence |
| --- | --- | --- | --- |
| Sycamore top | Rounded rectangular platform; blind letter pockets and four through leg sockets | Fixed | Material, footprint, thickness stated / high |
| Four cherry legs | Cylinders through top, flush at upper surface | Fixed after assembly | Diameter stated; through joinery visible in details / high |
| L, E, E inserts | Blue wooden letters resting on blind pocket floors | Independent vertical removal | Color, rounded outlines, approximate depth and removal lip stated / high |
| Finger wells | Semicircular access outside lower letter edge | Fixed pocket feature | Visible in top and detail / medium |
| Flush caps | Cherry end grain at leg centers | Integrated leg ends in model | Image calls these plugs/caps but also says legs run through top / medium |

Observed dimensions: top 12.5 × 9.5 × 1.5 inches; leg diameter 1 inch; exposed legs 7–8 inches; letters approximately 1 inch deep. Defaults use the midpoint leg height of 7.5 inches, giving 9 inches overall, and a 1-inch pocket/letter depth.

Assumed, editable defaults: 0.5-inch plan corner radius, 0.125-inch edge roundover, 27.55 mm (approximately 1.08-inch) leg-center setback, 3.5-inch letter height, 0.75-inch letter gap, 0.35 mm clearance per side, 0.15 mm leg socket clearance per side, and a 0.4-inch finger-well radius. Letter widths and strokes derive from the letter height and the orthographic reference proportions. The rendered top uses an approximate sycamore grain; figure varies by board.

Constraints: total height = exposed leg height + top thickness; leg blank length = total height; pocket floor thickness = top thickness − letter depth. Letter layout is centered, with width = 0.68 × letter height and group width = three letter widths + two gaps. Setbacks keep leg sockets inside the rounded top; layout and clearance controls are coupled to preserve separation from sockets, perimeter and neighboring pockets. Flush letters have a gap only around their sides. Finger wells share the pocket floor. The top mesh has real blind recesses and real through holes rather than overlaid decorations.

Unresolved source details: glue/tenon retention, exact plug construction, grain orientation, finish, fit after finishing and load rating. The model represents continuous through legs, with flush ends; it does not invent separate caps or hidden fasteners. It is a design/fabrication model, with no certified load rating.

Verification views: assembled top oblique for color and letters; top for three outlines, wells and four caps; bottom/side for through legs and top thickness; removed letters for blind floors; individual top and letter export topology. The source is illustrative and leaves several dimensions inferred, so this is reference-matched, not a measured 1:1 reconstruction.
