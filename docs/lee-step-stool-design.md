# Lee Step Stool

Source: `models/lee-step-stool/reference/design.png`, the user-supplied illustrated design sheet. The sheets are design evidence, not engineering or tested fabrication plans. The follow-up rounded-letter sheet is preserved as `models/lee-step-stool/reference/rounded-letters.png`.

Source SHA-256: `64dea512e5be2049d63c01a3ba3614adcbd6fa8668c5460ba253ef8e40002e6d`.

Rounded-letter source SHA-256: `835294c8ce50f69b3432141ec91238fa078d2f3f89b5ee7b2489fbe512e57f6a`.

## Evidence brief

Coordinate frame: X runs along the 12.5-inch top, Y across the 9.5-inch top, Z vertically from the floor. Letters read from the front (negative Y). Top and four leg centers are fixed datums; each loose letter can lift vertically from its pocket. There is no router mechanism or adjustable hardware in this design.

| Part             | Role and mating surface                                                         | State / motion               | Evidence / confidence                                                    |
| ---------------- | ------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------ |
| Sycamore top     | Rounded rectangular platform; blind letter pockets and four through leg sockets | Fixed                        | Material, footprint, thickness stated / high                             |
| Four cherry legs | Cylinders through top, flush at upper surface                                   | Fixed after assembly         | Diameter stated; through joinery visible in details / high               |
| L, E, E inserts  | Blue wooden letters resting on blind pocket floors                              | Independent vertical removal | Color, rounded outlines, approximate depth and removal lip stated / high |
| Finger wells     | Semicircular access outside lower letter edge                                   | Fixed pocket feature         | Visible in top and detail / medium                                       |
| Flush caps       | Cherry end grain at leg centers                                                 | Integrated leg ends in model | Image calls these plugs/caps but also says legs run through top / medium |

Observed source dimensions: top 12.5 × 9.5 × 1.5 inches; leg diameter 1 inch; exposed legs 7–8 inches; letters approximately 1 inch deep. The user later requested shorter, wider legs, rounded letters and independent horizontal layout controls, then selected modern rounded sans-serif outlines with no serifs.

Current defaults come from the user's supplied inch URL: top 13 × 9 × 1.5 inches; floor-to-underside leg clearance 6.25 inches; leg diameter 1.25 inches; leg-center setback 1.3952 inches; plan corner radius 0.5 inch; edge roundover 0.2398 inch. Overall stool height is 7.75 inches. Letters are 3.25 inches high × 2 inches wide × 0.75 inch deep, with 1-inch horizontal gaps and a 1.5-inch minimum wood border. Letter fit clearance is 0.0379 inch per side; socket clearance is 0.0197 inch per side; finger-well radius is 0.375 inch. These values override the illustrated source dimensions. The rendered top uses an approximate sycamore grain; figure varies by board.

Supported clearance ranges are 0.15–3.175 mm per side for letters and 0.05–1.5875 mm per side for sockets. Socket diameter equals the leg diameter plus twice the socket clearance. Letter pocket width/height grow by twice the letter clearance, with the inserts unchanged. A minimum 1.27 mm wood web between adjacent pocket bounds increases the minimum horizontal letter gap at large clearances. Leg height supports 4–8 inches and diameter supports 1–2 inches.

Constraints: total height = exposed leg height + top thickness; leg blank length = total height; pocket floor thickness = top thickness − letter depth. Letter layout is centered, with group width = three letter widths + two edge-to-edge horizontal gaps. Setbacks keep leg sockets inside the rounded top. Layout controls preserve the selected minimum wood border and at least 3.175 mm of wood between pocket bounds and corner sockets. Socket separation uses both X and Y distances so wider legs do not unnecessarily compress the letter group into a narrow X-only strip. Extreme settings normalize size and gap controls to the available space. Flush letters have a gap only around their sides. Finger wells share the pocket floor. The top mesh has real blind recesses and real through holes rather than overlaid decorations.

Unresolved source details: glue/tenon retention, exact plug construction, grain orientation, finish, fit after finishing and load rating. The model represents continuous through legs, with flush ends; it does not invent separate caps or hidden fasteners. It is a design/fabrication model, with no certified load rating.

Verification views: assembled top oblique for color and letters; top for three outlines, wells and four caps; bottom/side for through legs and top thickness; removed letters for blind floors; individual top and letter export topology. The source is illustrative and leaves several dimensions inferred, so this is reference-matched, not a measured 1:1 reconstruction.

## Controls and fabrication parity

Independent letter-top and pocket-rim roundovers default to 1/16 inch. Straight letter/pocket walls retain the fit clearance; only the upper profiles shrink or open. The well has tangent entry curves to keep its rim continuous. Small strokes, tight E notches, narrow letter bottoms and socket proximity constrain effective radii and layout. The SVG distinguishes straight pocket walls, dashed amber rim mouths, and blue insert outlines. See [fit and thumb-access guidance](lee-step-stool-fit.md) for proposed workshop starting points.

The inspector begins with Letter layout: height, width, horizontal gap and minimum wood border. The Legs section follows with clearance/diameter sliders and 5, 6, 7.5-inch clearance presets plus 1, 1.5, 2-inch diameter presets. Edges & thumb access follows the legs, with independent roundover controls, fit clearance, well radius and child/shared/roomy presets. Assembly and exports are in an expandable section; detailed top/fit settings follow. Info icons use the shadcn/ui Radix tooltip composition, with descriptions available on hover and keyboard focus. Pocket fit clearance remains distinct from the wood border. Geometry, assembled/exploded previews, registered and individual STLs, and the SVG all use the same rounded sans-serif letter contours and effective dimensions.


## Upper-lamination CNC export

The dedicated upper-lamination STL contains the upper half of the top alone, with thickness derived as half the finished top thickness. The bottom is a flat glue face at Z = 0, with centered XY coordinates and millimeter geometry. It shares the top-edge and pocket-rim roundovers, plan corners, finger wells and effective letter fit dimensions with the assembled model.

At the selected 13 × 9 × 1.5-inch top and 0.75-inch pocket depth, the exported layer is 13 × 9 × 0.75 inches. Letters and finger wells are through-cuts in the upper layer. All four leg socket locations retain solid stock; the sockets are drilled after laminating the two layers. The lower layer provides the 0.75-inch pocket floor. If pocket depth is shallower than half the top thickness, the upper layer retains a blind floor. If deeper, the export contains through-pockets and the inspector reports the additional depth needed in the lower layer.

This STL describes the finished upper part for CAM. Cutter selection, allowances, tabs, cut-through overshoot, workholding, stock origin and toolpaths are set in the CAM job. The glue face has no underside roundover.
