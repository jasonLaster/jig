# Vinny Table model and structural-screen specification

The Vinny Table model is derived from the user-supplied 2026 Imperial supplemental dimensional drawing. The drawing explicitly says that the physical work and course instruction override its nominal dimensions, so this model keeps every fabrication result editable and non-certifying.

## Default dimensional contract

- Overall envelope: 96 × 40 × 30 in.
- Solid tabletop: 1 1/2 in thick.
- Advanced base: eight 1 1/2 in thick profiled halves, mitered in pairs into four L-shaped corner legs.
- Advanced leg profile: 6 in at the frame, shoulder begins 2 1/2 in below the top, and foot is 2 in wide.
- Advanced aprons and stretchers: 1 1/2 × 2 1/2 in sections.
- Long aprons: table length minus 12 in; short aprons: table width minus 12 in; stretchers: table width minus 3 in.
- Three stretchers: one centered and two 22 in on center from the middle stretcher.
- Flush-top shadow groove: 1/2 × 1/4 in. Alternate overhang default: 1 1/2 in.

The simple and intermediate options retain the source's 2 1/2 in leg blanks, 1 1/4 in frame thickness, length/width minus 5 in apron rules, and width minus 2 1/2 in stretcher rule. The intermediate leg preserves the double taper to a 1 1/2 in foot.

## Geometry and fabrication ownership

The same parameter source owns assembled geometry, URL state, oak grain direction, the fabrication cut list, audit values, structural comparison, brochure dimensions, and registered wood/hardware STL exports. The advanced leg is one continuous closed L-shaped solid in the viewer, while the cut list exposes its eight buildable profile halves and 45-degree miter pairing.

The source leaves exact Domino, dowel, pocket-hole, insert, button, and top-fastener locations to the course and builder. The model therefore describes those choices in notes without inventing hole patterns or claiming joint capacity.

## Structural screen

### Long-apron racking

Credits the two continuous long aprons and four modeled corner-leg sections. Unknown joint rotation receives no capacity credit.

### End-frame racking

Credits the two short aprons as continuous end-frame members. Domino, dowel, or pocket-hole strength must come from the selected physical joint and a representative corner test.

### Frame-and-stretcher torsion

Credits the closed four-apron perimeter and all three cross stretchers as a continuous modeled load path. Tabletop fastener slip and joint stiffness remain outside the calculation.

### Tipping margin

Uses the selected base envelope and overall height. It is not a safe-load prediction for sitting, leaning, or climbing.

### Floor rocking tolerance

The four independently adjustable leveling feet receive contact-plane credit when enabled. Insert pullout, thread capacity, adjustment travel, floor bearing, and settling still require physical checks.

### Member stiffness

Compares relative leg, apron, and tabletop slenderness. It does not calculate allowable stress, deflection, buckling, wood variability, or connection capacity.

### Overall weighting and grades

The composite weights are 23% long-apron racking, 22% end-frame racking, 20% torsion, 12% tipping, 10% floor rocking, and 13% member stiffness. Grades are comparative: A ≥ 85, B ≥ 75, C ≥ 65, D ≥ 50, and F < 50.

## Physical validation boundary

This is a geometry-only screen, not engineering certification. Before build approval, verify actual stock, the chosen joint method, tabletop movement allowance, corner fit, fastener clearances, full-size lateral racking, rocking on the destination floor, tabletop deflection, tipping behavior, and repeated-load durability. The physical result overrides this screen.
