// Camera choreography for each scene. Text lives in content.json (scenes.<id>).
// cam / target are world positions; duration is seconds in Auto-play.
export const SCENES = [
  { id: 'overview', zone: null, cam: [72, 92, 118], target: [-4, 0, 2], duration: 14, orbit: true, dist: 1,
    devices: [] },
  { id: 'gate', zone: 'gate', cam: [-26, 15, 66], target: [-46, 1.5, 47], duration: 11,
    devices: ['visitor-kiosk', 'boom-barrier', 'visitor-badge'] },
  { id: 'dock', zone: 'dock', cam: [-24, 25, 33], target: [-43, 1, 13], duration: 12,
    devices: ['rfid-dock-portal', 'pallet-rfid-tag', 'dock-status-light', 'rfid-label-printer'] },
  { id: 'warehouse', zone: 'warehouse', cam: [-20, 21, 14], target: [-42, 2, -6], duration: 12,
    devices: ['wms', 'rtls-rfid-anchor', 'ai-vision-camera-wh', 'esl-shelf', 'pick-to-light'] },
  { id: 'intralogistics', zone: 'amr', cam: [4, 19, 22], target: [-14, 1, 0], duration: 12,
    devices: ['amr', 'amr-charging', 'conveyor-dock'] },
  { id: 'production', zone: 'production', cam: [42, 25, 34], target: [24, 3, 0], duration: 16,
    devices: ['mes-dashboard', 'digital-wi', 'mold-qr', 'ai-vision-inspection', 'auto-label', 'esl-lineside', 'rfid-kanban'] },
  { id: 'process', zone: 'production', cam: [36, 13, 33], target: [21, 3.5, 15], duration: 14,
    devices: ['process-control', 'mes-dashboard'] },
  { id: 'office', zone: 'office', cam: [-23, 25, -18], target: [-31, 3, -36], duration: 12,
    devices: ['cmms', 'paperless-pr-po', 'hr-system'] },
  { id: 'infra', zone: 'infra', cam: [34, 86, 70], target: [-2, 0, -4], duration: 12, xray: true, dist: 1,
    devices: ['fiber-backbone', 'network-rack', 'lan-access'] },
  { id: 'highlight', zone: null, cam: [1, 70, 58], target: [-8, 2, -7], duration: 27, chain: true, dist: 1,
    devices: ['esl-lineside', 'mes-dashboard', 'pick-to-light', 'amr'] },
];
