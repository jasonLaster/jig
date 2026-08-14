# Vinny Table model and structural-screen specification

The Vinny Table model is derived from the user-supplied 2026 Imperial supplemental dimensional drawing. The drawing explicitly says that the physical work and course instruction override its nominal dimensions, so this model keeps every fabrication result editable and non-certifying.

## Default dimensional contract

- Overall envelope: 96 × 40 × 30 in.
- Solid tabletop: 1 1/2 in thick.
- Advanced base: eight 1 1/2 in thick profiled halves, mitered in pairs into four L-shaped corner legs.
- Advanced leg profile: 6 in at the frame, 2 in at the foot, and a 1 1/2 in circular shoulder whose upper tangent is derived from - and always meets - the live apron bottom.
- Aprons and oak stretchers: a directly editable 1 1/2 in thickness × 2 1/2 in height (board width).
- Long and short apron lengths derive from the live table footprint minus the two live leg widths. Stretcher and channel lengths derive from the live inside apron faces. There are no deduction controls.
- Three stretchers: one centered and two 22 in on center from the middle stretcher.
- Alternate support mode: three steel C-channels replace the three oak stretchers on those same centerlines. The default channel section is 2 in wide × 1/2 in deep with a 1/8 in wall.
- Four optional diagonal oak blocks connect the inside corners between each long and short apron. Independent 8 in default reaches along the long and side aprons determine the centerline and both calculated contact angles.
- Flush-top shadow groove: 1/2 × 1/4 in. Alternate overhang default: 1 1/2 in.
- Edge treatments: 1 in tabletop plan corners, 1/2 in tabletop top-edge roundover, an independent 3/4 in outside leg-corner radius, a shared 1/8 in radius on every other exposed convex vertical leg edge, and a 3/4 in roundover on only the outer lower edge of each apron.

The simple and intermediate options retain the source's 2 1/2 in leg blanks and derive their apron lengths from those live leg dimensions. They share the editable apron section and inside-face stretcher relationship. The intermediate leg preserves the double taper to a 1 1/2 in foot.

## Geometry and fabrication ownership

The same grouped parameter source owns assembled geometry, URL state, oak grain direction, the fabrication cut list, audit values, structural comparison, brochure dimensions, and registered wood/hardware STL exports. Overall, tabletop, legs, apron, supports, corner blocks, and adjustable feet each have a dedicated collapsible control group. The advanced leg is one continuous closed L-shaped solid in the viewer, while the cut list exposes its eight buildable profile halves and 45-degree miter pairing. The apron-height parameter owns the exact elevation where the circular shoulder becomes tangent to the apron bottom, so those surfaces cannot drift apart.

Tabletop corner radius and top-edge roundover are separate controls. The advanced L-leg and both post-leg alternatives use the same independent outside-corner radius plus one shared radius applied to every other exposed convex vertical edge. The apron roundover is real topology on the outside lower longitudinal edge only. Its inside face stays square for the corner blocks, and both end lands transition back to square before the leg joint so the mating faces trim flush.

The support selector is mutually exclusive: wood mode includes three oak stretchers in the wood geometry and cut list; C-channel mode removes those stretchers and adds three U-shaped steel channels to the hardware geometry, hardware STL, and fabrication list. The channels stop at the same derived inside-face relationship as the stretchers. Four optional diagonal oak blocks remain independent of that support choice. Each block is a closed mitered solid whose two end planes coincide with the live square inside faces of the long and short aprons; unequal reaches produce unequal calculated contact angles rather than a forced 45-degree proxy.

The source leaves exact Domino, dowel, pocket-hole, insert, button, and top-fastener locations to the course and builder. The model therefore describes those choices in notes without inventing hole patterns or claiming joint capacity.

## Structural screen

### Long-apron racking

Credits the two continuous long aprons and four modeled corner-leg sections. Unknown joint rotation receives no capacity credit.

### End-frame racking

Credits the two short aprons as continuous end-frame members. Domino, dowel, or pocket-hole strength must come from the selected physical joint and a representative corner test.

### Frame-and-support torsion

Credits the closed four-apron perimeter, the selected three-member cross-support system, and the four modeled diagonal corner blocks as distinct paths. Oak stretchers receive frame-topology credit. Steel C-channels receive limited tabletop-plane credit only: they are not counted as apron-leg bracing. Tabletop fastener slip, block joints, channel slots, and connection stiffness remain outside the calculation.

### Tipping margin

Uses the selected base envelope and overall height. It is not a safe-load prediction for sitting, leaning, or climbing.

### Floor rocking tolerance

The four independently adjustable leveling feet receive contact-plane credit when enabled. Insert pullout, thread capacity, adjustment travel, floor bearing, and settling still require physical checks.

### Member stiffness

Compares relative leg, apron, and tabletop slenderness, with a small tabletop-plane contribution when C-channels are selected. It does not calculate allowable stress, deflection, buckling, wood variability, composite action, or connection capacity.

### Overall weighting and grades

The composite weights are 23% long-apron racking, 22% end-frame racking, 20% torsion, 12% tipping, 10% floor rocking, and 13% member stiffness. Grades are comparative: A ≥ 85, B ≥ 75, C ≥ 65, D ≥ 50, and F < 50.

## Physical validation boundary

This is a geometry-only screen, not engineering certification. Before build approval, verify actual stock, the chosen joint method, tabletop movement allowance, corner fit, fastener clearances, full-size lateral racking, rocking on the destination floor, tabletop deflection, tipping behavior, and repeated-load durability. The physical result overrides this screen.
