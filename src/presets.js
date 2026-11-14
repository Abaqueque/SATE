export const presets = [
  { id: "barnards-star", name: "Barnard’s Star", ra: 269.452077, dec: 4.693365, wavelength: 1.6, size: 0.2 },
  { id: "epsilon-indi-b", name: "Epsilon Indi B", ra: 331.044125, dec: -56.782806, wavelength: 4.5, size: 0.1 },
  { id: "wise-0855", name: "WISE 0855", ra: 133.795129, dec: -7.245147, wavelength: 4.5, size: 0.2 },
  { id: "rw-aurigae", name: "RW Aurigae", ra: 76.956375, dec: 30.401389, wavelength: 2.2, size: 0.1 },
  { id: "r-draconis", name: "R Draconis", ra: 248.167611, dec: 66.754979, wavelength: 3.29, size: 0.1 },
  { id: "orion-nebula", name: "Orion Nebula", ra: 83.8221, dec: -5.3911, wavelength: 3.29, size: 0.05 },
  { id: "andromeda", name: "Andromeda", ra: 10.6847, dec: 41.269, wavelength: 1.6, size: 0.1 },
  { id: "galactic-centre", name: "Galactic Centre", ra: 266.4168, dec: -29.0078, wavelength: 4.5, size: 0.1 },
];

export function queryKey({ ra, dec, wavelength, size }) {
  return [ra, dec, wavelength, size].map(Number).join(":");
}
