// WebXR: the ground sky or the landed surface in a headset (immersive-vr), and constellations over the phone camera (immersive-ar).
// Loaded on first use from app.js. Head tracking comes from three.js's WebXRManager; controllers point and select.
import * as THREE from 'three';

let api = null, session = null, kind = null, rig = null, floorless = false, ctrls = [], tag = null, tagAt = 0;
export const presenting = () => !!session;
export const isFloorless = () => floorless;

function textSprite() {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96;
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, depthWrite: false, transparent: true })); s.renderOrder = 999; s.visible = false;
  s.userData.set = (txt) => { const x = cv.getContext('2d'); x.clearRect(0, 0, 512, 96); x.fillStyle = 'rgba(13,17,36,0.9)'; x.fillRect(0, 0, 512, 96);
    x.strokeStyle = '#4C8DF6'; x.lineWidth = 4; x.strokeRect(2, 2, 508, 92); x.fillStyle = '#E9ECF6'; x.font = '600 44px "Pretendard Variable", "Malgun Gothic", sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(txt, 256, 50); t.needsUpdate = true; };
  return s;
}
function makeControllers(r) {
  ctrls = [0, 1].map((i) => {
    const c = r.xr.getController(i), g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x4c8df6, depthTest: false, transparent: true, opacity: 0.85 })); line.renderOrder = 998; line.frustumCulled = false; c.add(line);
    c.addEventListener('select', () => onSelect(c));
    c.addEventListener('connected', (e) => { c.userData.hand = e.data; line.visible = e.data.targetRayMode === 'tracked-pointer'; });
    return c; });
}
function onSelect(c) { // the direction the controller points, in the frame the app works in (rig yaw undone), sent to the app's picker
  const d = new THREE.Vector3(0, 0, -1).transformDirection(c.matrixWorld); const name = api.pickDir(d);
  if (!tag) return; tag.visible = !!name; if (!name) return; tag.userData.set(name); tagAt = performance.now();
  const far = c.userData.far || 3; tag.position.copy(c.getWorldPosition(new THREE.Vector3())).addScaledVector(d, far); tag.scale.set(far * 0.32, far * 0.06, 1);
}
// called by the app every frame before rendering: keeps the controllers and the name tag in the scene being drawn
export function tick(scene, camera) {
  if (!session) return;
  const far = Math.max(3, camera.near * 2.4);
  for (const c of [...ctrls, tag]) { if (!c) continue; if (c.parent !== (c === tag ? scene : rig)) (c === tag ? scene : rig).add(c); }
  if (rig.parent !== scene) { scene.add(rig); }
  for (const c of ctrls) { c.userData.far = far; c.children[0].scale.setScalar(far); }
  if (tag && performance.now() - tagAt > 4000) tag.visible = false;
  if (camera.parent !== rig && !api.ownRig) rig.add(camera);
}
// kind: 'vr' | 'ar'
export async function start(appApi, k) {
  api = appApi; kind = k;
  const r = api.renderer, opt = k === 'ar'
    ? { optionalFeatures: ['dom-overlay', 'local-floor'], domOverlay: { root: document.body } }
    : { optionalFeatures: ['local-floor', 'bounded-floor'] };
  try { session = await navigator.xr.requestSession(k === 'ar' ? 'immersive-ar' : 'immersive-vr', opt); }
  catch (e) { api.status(k === 'ar' ? 'AR을 시작할 수 없습니다. 카메라 권한이나 기기 지원을 확인해 주세요.' : 'VR을 시작할 수 없습니다. 헤드셋이 연결되어 있는지 확인해 주세요.'); session = null; return false; }
  r.xr.enabled = true;
  floorless = false;
  try { await session.requestReferenceSpace('local-floor'); r.xr.setReferenceSpaceType('local-floor'); } catch { floorless = true; r.xr.setReferenceSpaceType('local'); }
  await r.xr.setSession(session);
  rig = api.rig || new THREE.Group(); api.ownRig = !!api.rig;
  makeControllers(r); tag = textSprite();
  // which way the headset or phone faces at the start: VR keeps the direction you were looking; AR asks the compass
  rig.rotation.set(0, api.startYaw(), 0);
  if (k === 'ar') { document.body.classList.add('xr-ar'); compassYaw().then((y) => { if (y != null) rig.rotation.y = y; }); }
  session.addEventListener('end', () => end());
  api.loop(true);
  api.status(k === 'ar' ? 'AR: 휴대폰을 하늘로 들어 보세요. 화면을 누르면 가리킨 천체 이름이 나옵니다.' : 'VR: 고개를 돌려 둘러보고, 컨트롤러로 천체를 가리킨 뒤 방아쇠를 당기면 이름이 나옵니다.');
  return true;
}
function compassYaw() { // one absolute-orientation reading: the azimuth the back camera points to (same formula as the gyro mode)
  return new Promise((res) => {
    const ev = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
    const done = (v) => { removeEventListener(ev, on); res(v); }, to = setTimeout(() => done(null), 1500);
    function on(e) { if (e.alpha == null) return; clearTimeout(to);
      const D = Math.PI / 180, a = (e.webkitCompassHeading != null ? 360 - e.webkitCompassHeading : e.alpha) * D, b = e.beta * D, g = e.gamma * D;
      const E = -Math.sin(g) * Math.cos(a) - Math.cos(g) * Math.sin(b) * Math.sin(a), N = -Math.sin(g) * Math.sin(a) + Math.cos(g) * Math.sin(b) * Math.cos(a);
      done(-Math.atan2(E, N)); } // XR -Z (start forward) turned to that azimuth
    addEventListener(ev, on);
  });
}
export function stop() { session?.end(); }
function end() {
  const r = api.renderer; session = null;
  for (const c of ctrls) c.removeFromParent(); ctrls = []; tag?.removeFromParent(); tag?.material.map.dispose(); tag?.material.dispose(); tag = null;
  if (!api.ownRig) { const cam = rig.children.find(o => o.isCamera); if (cam) { rig.remove(cam); } rig.removeFromParent(); }
  rig = null; r.xr.enabled = false; document.body.classList.remove('xr-ar');
  api.loop(false); api.onEnd?.(kind);
}
