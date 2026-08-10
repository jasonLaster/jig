# The Wave

## Design intent

The Wave keeps the 75 × 35.5 × 29.5 in Hover-table envelope, profiled oak top, three recessed widthwise C-channels, and two lengthwise upper rails. It replaces each closed transverse end box with an open frame made from one sculpted top rail and two full-height legs. Four mirrored knee braces join the inside faces of those lengthwise rails to the transverse top rails, closing a plan-view triangle at every corner.

The top rail owns both the outer and inner constant-radius circular fillets. Each radius stays tangent to the horizontal rail and its adjoining leg, creating the recognizable wave-shaped shoulder without separate curve-tension controls. The fillets meet each leg at square tangent seams, keeping the leg blank straight-grained and independently fabricable. The opening continues to the floor; there is no hidden bottom rail.

The two default lengthwise rails are 2.5 in high × 2.5 in wide and add mirrored 2.5 in true-circular upper-end returns. In side elevation, each return stays tangent to the tabletop-facing top and descends through the full rail height at the leg frame, echoing the aggressive circular shoulder of the transverse Wave frames. The top and shoulder face edges also use the same 3/8 in round-over as the legs by default. A URL-backed “Match the leg round-over” control keeps those face-edge radii coupled; turning it off reveals the independent lengthwise-rail edge radius. The full-height return is intentionally fabrication-intensive and requires engineered positive joinery rather than relying on end bearing.

## Default assembly

- 1 profiled oak tabletop
- 3 flush blackened-steel C-channels
- 2 mirrored wave-curve top rails
- 4 full-height oak legs, each 2 in wide × 4 in deep
- 2 in high wave-curve top rails
- 2 parallel 2.5 × 2.5 in lengthwise upper rails with 2.5 in circular upper-end returns
- 4 mirrored 45° top-frame knee braces with 10 in reach along each joined rail
- no lower lengthwise member
- 4 recessed adjustable leveling feet

The default cut list therefore contains 20 finished pieces across seven schedule lines. The top and leg routing-template families come from the same B1 and B3 profiles used by the assembled model, exploded view, and cut list.

The open floor is a fixed Wave design rule. Lower-support URL values and UI edits normalize back to `None`; the shared Hover metadata remains only for schema compatibility.

## Joinery and load path

The lengthwise rails bear directly against the tabletop underside, but their default full-height upper-end returns intentionally eliminate a broad square end-bearing face at the leg frames. Each rail/frame connection therefore needs verified positive joinery; the same is true at both ends of every diagonal brace. Housed loose tenons or another tested equivalent are preferable to fasteners driven into end grain. The leg-to-top-rail seams should likewise be treated as structural joinery rather than decorative butt joints. The model preserves the finished profiles but does not prescribe or certify a tested joint.

The corner triangles improve plan-view squareness and top-frame torsion, but they do not triangulate the legs vertically or create a lower torsional plane. Removing the bottom rails still reduces transverse frame closure and floor-level torsion. The in-app structure panel keeps those penalties and should be read only as a geometry comparison, not engineering certification. Build one complete rail/top-rail/brace corner mockup, then perform loaded diagonal-push and twist tests on the full base before committing furniture stock.
