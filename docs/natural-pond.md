# V1.2 — Natural Pond Pass

The aim is a quiet, living pond, using the existing procedural pixel renderer.
This is an animation informed by biology, not a fluid-dynamics simulation.
Timing, drag, and amplitudes are tuned for the pond's logical pixels; they are
not claimed as measured biological constants.

## Koi

The V1.1 pause had two concrete causes: `Hover` asked for zero speed, and
`Pivot` asked for 16% of cruise speed. Both were common transitions. In V1.2:

- Coast integrates quadratic drag (`v / (1 + k v dt)`) without stopping;
  propulsion resumes before speed falls below 48% of cruise speed.
- Brief rest is rare, keeps forward drift, and has an independent pectoral-fin
  clock. Fish start swimming instead of spawning in rest or pivot states.
- Turns keep forward motion, with a brief bend and relaxation/recoil envelope.
  Tail phase remains continuous; effort responds to speed and acceleration,
  and the body straightens during coasting.
- Call latency, approach, orbit, loss of interest, avoidance, depth, and
  scattering remain in the existing school/state architecture.

Sources:

- Wu, Yang & Zeng (2007), [Kinematics, hydrodynamics and energetic advantages
  of burst-and-coast swimming of koi carps](https://doi.org/10.1242/jeb.001842).
  The relevant observation is active propulsion followed by passive forward
  travel; energy savings are not a claim made by this implementation.
- Yang et al. (2010), [A study on flow physics of burst-and-coast swimming
  of koi carp](https://www.jstage.jst.go.jp/article/jabmech/1/1/1_1_30/_article).
  The body/tail returns toward straight between propulsive bouts. Both
  multiple-tail-beat and half-tail-beat motion occur in the observations.
- Wu, Yang & Zeng (2007), [Routine turning maneuvers of koi carp](https://pubmed.ncbi.nlm.nih.gov/18055627/).
  Bending and tail recoil inform the turn animation; body heading alone is
  insufficient to convey the maneuver.
- The Nature Box, [Koi carp in a park](https://commons.wikimedia.org/wiki/File:Koi_carp_in_a_park.webm),
  Shinjuku Gyoen (2015), CC BY 4.0. Used as a public video reference for forward
  movement, body bending and pectoral activity; no footage is shipped.

## Medaka

The generic tiny-fish system becomes Japanese ricefish / Medaka. Its existing
population, batches, configuration, and startle propagation are reused. Bodies
are slender, tails are less deeply forked, and palettes are muted ricefish gold,
silver, and olive. Body and tail undulation continues through acceleration,
steady travel, and deceleration. Schoolmates coordinate speed with small
response lags; their tail phases do not lock together. Startle changes intent
and smoothly accelerates, without replacing velocity with an impulse.

[Harpaz et al., Collective Behavior in Medaka Fish Depends on Discrete Kinematic
States of Swimming Behavior](https://pmc.ncbi.nlm.nih.gov/articles/PMC12324306/)
(2025 **preprint**) describes these three continuous-swimming modes and stronger
social responsiveness during steady travel. The simplified school cadence here
is an artistic interpretation, not a reproduction of its experimental model.
No second new species or personality system is added.

## Lotus, water and weather

[NParks' Nelumbo nucifera description](https://www.nparks.gov.sg/florafaunaweb/flora/2/2/2257)
and [University of Florida's botanical reference](https://plant-directory.ifas.ufl.edu/plant-directory/nelumbo-nucifera/)
inform the entire, circular, peltate leaf and central attachment. The default
has no water-lily notch. The old notch control remains available for saved custom
artwork. Branching radial veins, subdued age/tone variation, asymmetric margins,
rim shading, different inclinations and elevations break up repetition.
Three staggered petal rings and a small seed receptacle replace flat star flowers.
Plant geometry stays static; only transforms change each frame.

Weather blends a shared surface state. Rain increases small surface movement
and leaf rocking; mist moves in thin banks; sunlight and moonlight create broken
reflections perturbed by the same ripple and fish-disturbance field. Shadows
change length and direction with lighting. Coasting fish retain a small wake.
Existing ripple fading, water clarity and depth attenuation stay intact.

## Settings and compatibility

Pond, Atmosphere, Sound, Language and Display are grouped navigation rows with
current-value summaries. Advanced has a separate group and retains the complete
editor. Normal settings are eagerly imported, so opening them never requests a
chunk. Advanced remains lazy and has its own error boundary, allowing a return
to ordinary settings if its download fails. Push/pop navigation restores focus;
English, Chinese, keyboard controls and reduced motion are retained.

Storage keys and the override schema are unchanged. Existing explicit artwork
customizations remain authoritative; defaults improve for new or reset settings.
The logical short edge remains 270 pixels, default population is unchanged, and
no dependencies, raster assets, render passes, or game systems were added.
