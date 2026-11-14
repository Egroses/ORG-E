# Challenge: Planet X and SPHEREx (NASA Space Apps 2026)

Source: https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/?tab=details
(Text pasted by the user on 2026-11-14; the site blocks automated fetching.)

- **Difficulty:** Advanced
- **Subjects:** Astrophysics, Planets & Moons, Software

## Summary

Since 2025, NASA's SPHEREx mission has been mapping the entire sky every six months in 102 bands of near-infrared light, returning images of more than a billion objects. Comets, asteroids, stars, brown dwarfs, and even new planets reveal themselves by shifting position between images, but no one person can sift through all that data alone. Your challenge is to create a public-facing web tool to display images of the sky from SPHEREx mission, making it easy for anyone to quickly see how they change over time.

## Background

Asteroids and comets orbit around the Sun. Nearby stars march across the sky as they orbit around the Galaxy. The Earth orbits the Sun too, causing objects near us to change their apparent positions. Watching for these motions help us discover new astronomical objects and also help measure the distances to these objects. For example, the dwarf planet Pluto was discovered when an astronomer compared two images of the sky taken at different times and recognized that one point of light had shifted between images.

More recently, astronomers have mounted massive searches for nearby objects using this process with help from the public. Hundreds of thousands of volunteers have used this technique to discover asteroids, comets, stars and brown dwarfs. Most of the known comets and brown dwarfs were discovered by volunteers in this manner through projects like backyardworlds.org.

Since May 2025, SPHEREx is mapping the whole sky once every six months in 102 bands of near-infrared light, making it uniquely sensitive to objects rich in hydrogen, water, carbon dioxide, carbon monoxide, and many other molecules. There will be images of more than a billion objects (brown dwarfs, quasars, comets, asteroids, stars, supernovae, galaxies) which often overlap or vary in brightness.

## Objectives

Create a public-facing web tool to display images of the sky from the SPHEREx mission, making it easy for anyone to quickly see how they change over time. **Users will enter the coordinates of a patch of sky (Right Ascension and declination). Your tool will display a series of images of that patch like a little video, making it easy to spot moving objects.**

**Test targets:**
- Barnard's Star
- Epsilon Indi B (a pair of brown dwarfs orbiting a star)
- WISE 0855 (fast-moving brown dwarf, RA 08h55m10.831s, Dec −7d14m42.53s; note: this is a 2010-epoch position)
- RW Aurigae (variable star)
- R Draconis (variable star)

## Potential considerations (optional)

- New SPHEREx data is arriving fast: design a tool that's easy to update with the latest data releases.
- Think creatively about displaying the 102 bands. E.g. add together all data taken by each of the six detector arrays to improve S/N. **Extra kudos if the tool can generate spectra on the fly.**
- Options to add together or subtract images taken at different times help discover moving objects.
- Let users choose the field of view (larger FOV tracks faster sources, at the cost of longer transfers).
- Overlay data from other telescopes, e.g. Gaia or WISE.
- Coordinates in the URL so the tool can be embedded elsewhere.
- Display metadata, like contamination flags.
- Use public tools: Astropy for data handling, Aladin (CDS) for display.

No judging criteria are stated on the challenge page.

## Resources listed by the challenge

NASA:
- IRSA SPHEREx resources: https://irsa.ipac.caltech.edu/Missions/spherex.html
- SPHEREx tutorial notebooks: https://caltech-ipac.github.io/irsa-tutorials/spherex/
- WiseView (model tool for WISE data, used by volunteers for hundreds of discoveries): http://byw.tools/wiseview
  Example URL params: `ra, dec, size, band, speed, minbright, maxbright, window, diff_window, linear, zoom, border, gaia, invert, maxdyr, scandir, neowise, diff, outer_epochs, unique_window, smooth_scan, shift, pmra, pmdec, synth_a*, synth_b*`
- Gaia mission data (use DR3): https://archive.stsci.edu/missions-and-data/gaia

CSA (Canadian Space Agency), secondary relevance:
- NEOSSat: https://www.asc-csa.gc.ca/eng/satellites/neossat/
- CADC: https://www.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/en/
- NEOSSat tutorial: https://github.com/asc-csa/NEOSSAT_Tutorial
- NEOSSat dataset: https://data.asc-csa.gc.ca/dataset/neossat
