import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore, type OrbitObject } from '../store';
import { BRIDGE_HTTP_URL, withToken } from '../config';
const DISK_PATH = /^\/(Users|home|root|Volumes|Applications|System|Library|private|tmp|var|opt|mnt|media|srv|data)\//;
function resolveSrc(src: string): string {
    const path = src.replace(/^file:\/\//, '');
    if (!DISK_PATH.test(path))
        return src;
    return withToken(`${BRIDGE_HTTP_URL}/file?path=${encodeURIComponent(path)}`);
}
type Entry = {
    def: OrbitObject;
    mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    texture: THREE.Texture | null;
    angle: number;
    aspect: number;
    dead: boolean;
    token: number;
};
const DEG = Math.PI / 180;
const RPM = (Math.PI * 2) / 60;
function release(group: THREE.Group, entry: Entry) {
    entry.texture?.dispose();
    entry.mesh.material.dispose();
    group.remove(entry.mesh);
}
export function Orbits() {
    const loader = useMemo(() => new THREE.TextureLoader(), []);
    const group = useMemo(() => new THREE.Group(), []);
    const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
    const entries = useMemo(() => new Map<string, Entry>(), []);
    const seen = useMemo<{
        list: OrbitObject[] | null;
    }>(() => ({ list: null }), []);
    useEffect(() => {
        return () => {
            for (const entry of entries.values())
                release(group, entry);
            entries.clear();
            geometry.dispose();
        };
    }, [entries, geometry, group]);
    function attach(entry: Entry, src: string) {
        const mine = ++entry.token;
        entry.dead = false;
        loader.load(resolveSrc(src), (texture) => {
            if (entry.token !== mine || entries.get(entry.def.id) !== entry) {
                texture.dispose();
                return;
            }
            texture.colorSpace = THREE.SRGBColorSpace;
            entry.texture?.dispose();
            entry.texture = texture;
            const image = texture.image as {
                width?: number;
                height?: number;
            };
            entry.aspect =
                image?.width && image?.height ? image.width / image.height : 1;
            entry.mesh.material.map = texture;
            entry.mesh.material.needsUpdate = true;
            entry.mesh.visible = true;
        }, undefined, () => {
            if (entry.token !== mine)
                return;
            entry.dead = true;
            console.warn('[zimo] orbit image failed to load', entry.def.id, src);
        });
    }
    function spawn(def: OrbitObject): Entry {
        const material = new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: def.opacity,
            depthWrite: false,
            toneMapped: false,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.visible = false;
        mesh.frustumCulled = false;
        group.add(mesh);
        return {
            def,
            mesh,
            texture: null,
            angle: def.phase * DEG,
            aspect: 1,
            dead: false,
            token: 0,
        };
    }
    function sync(list: OrbitObject[]) {
        const alive = new Set<string>();
        for (const def of list) {
            alive.add(def.id);
            const entry = entries.get(def.id);
            if (!entry) {
                const created = spawn(def);
                entries.set(def.id, created);
                attach(created, def.src);
                continue;
            }
            if (entry.def.src !== def.src)
                attach(entry, def.src);
            if (entry.def.phase !== def.phase)
                entry.angle = def.phase * DEG;
            entry.def = def;
        }
        for (const [id, entry] of entries) {
            if (alive.has(id))
                continue;
            release(group, entry);
            entries.delete(id);
        }
    }
    useFrame((state, dt) => {
        const { orbits } = useStore.getState().ui;
        if (orbits !== seen.list) {
            seen.list = orbits;
            sync(orbits);
        }
        if (entries.size === 0)
            return;
        const fit = Math.min(state.viewport.width, state.viewport.height);
        const perPx = state.viewport.width / state.size.width;
        for (const entry of entries.values()) {
            if (entry.dead || !entry.texture)
                continue;
            const def = entry.def;
            entry.angle += dt * def.speed * RPM;
            const distance = def.radius * fit * 0.5;
            const tilt = def.tilt * DEG;
            const x = Math.cos(entry.angle) * distance;
            const y = Math.sin(entry.angle) * distance;
            entry.mesh.position.set(x, y * Math.cos(tilt), y * Math.sin(tilt));
            const span = def.size * perPx;
            const wide = entry.aspect >= 1;
            entry.mesh.scale.set(wide ? span : span * entry.aspect, wide ? span / entry.aspect : span, 1);
            entry.mesh.quaternion.copy(state.camera.quaternion);
            entry.mesh.material.opacity = def.opacity;
        }
    });
    return <primitive object={group}/>;
}
