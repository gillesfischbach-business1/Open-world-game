// Geräteprofile für den Emulationstest.
// gpu = Text, den der Browser als Grafikchip meldet (WEBGL_debug_renderer_info); expect = erwartete Startstufe.
// cpu = Drosselung des Prozessors (1 = PC-Tempo, 4 = altes Einsteigerhandy), als grobe Annäherung.
export const DEVICES = [
  { id: 'iphone15pro', name: 'iPhone 15 Pro', pw: 'iPhone 15 Pro', gpu: 'Apple GPU', mem: undefined, cores: 6, webgpu: true, cpu: 1.5, expect: 'high' },
  { id: 'pixel8', name: 'Google Pixel 8', pw: 'Pixel 7', gpu: 'Mali-G715-Immortalis MC10', mem: 8, cores: 9, webgpu: true, cpu: 2, expect: 'high' },
  { id: 'galaxys21', name: 'Samsung Galaxy S21', pw: 'Galaxy S9+', gpu: 'Adreno (TM) 660', mem: 8, cores: 8, webgpu: true, cpu: 2, expect: 'mid' },
  { id: 'galaxya14', name: 'Samsung Galaxy A14 (Einsteiger)', pw: 'Galaxy S8', gpu: 'Mali-G52 MC2', mem: 4, cores: 8, webgpu: false, cpu: 4, expect: 'mid' },
  { id: 'motog4', name: 'Moto G4 (alt, 2 GB)', pw: 'Moto G4', gpu: 'Adreno (TM) 405', mem: 2, cores: 8, webgpu: false, cpu: 6, expect: 'low' },
  { id: 'ipadair', name: 'iPad Air (M1)', pw: 'iPad Pro 11', gpu: 'Apple GPU', mem: undefined, cores: 8, webgpu: true, cpu: 1, expect: 'high' },
  { id: 'laptop', name: 'Laptop mit Intel UHD', pw: null, viewport: { width: 1366, height: 768 }, gpu: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)', mem: 8, cores: 4, webgpu: true, cpu: 1, expect: 'mid' },
  { id: 'gamingpc', name: 'Gaming-PC (RTX)', pw: null, viewport: { width: 1920, height: 1080 }, gpu: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)', mem: 8, cores: 16, webgpu: true, cpu: 1, expect: 'high' },
];
