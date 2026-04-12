import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Box, Plane, Cylinder, Sphere, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

const ROAD_LENGTH = 600;
const ROAD_WIDTH = 40;
const STOP_LINE_DIST = 22;
const SPAWN_DIST = 180;

const BASE_SPEED = 0.8;
const ACCEL = 0.05;
const DECEL = 0.06;
const SAFE_DISTANCE = 3.0;


// Lane separator offsets — 4 lanes per arm: -12, -4, 4, 12 (centre divider at 0)
const LANE_OFFSETS = [-12, -4, 4, 12];

function Road() {
    return (
        <group>
            {/* Road surfaces */}
            <Plane args={[ROAD_WIDTH, ROAD_LENGTH]} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow><meshStandardMaterial color="#2a2a2a" roughness={0.8} /></Plane>
            <Plane args={[ROAD_LENGTH, ROAD_WIDTH]} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 0]} receiveShadow><meshStandardMaterial color="#2a2a2a" roughness={0.8} /></Plane>
            <Plane args={[ROAD_WIDTH, ROAD_WIDTH]} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} receiveShadow><meshStandardMaterial color="#222222" roughness={0.8} /></Plane>

            {/* North-South lane markings */}
            <group position={[0, 0.02, 0]}>
                {/* Centre double-yellow divider */}
                <Plane args={[0.2, ROAD_LENGTH / 2 - ROAD_WIDTH / 2]} rotation={[-Math.PI / 2, 0, 0]} position={[-0.3, 0, ROAD_LENGTH / 4 + ROAD_WIDTH / 4]}><meshBasicMaterial color="#e6c229" /></Plane>
                <Plane args={[0.2, ROAD_LENGTH / 2 - ROAD_WIDTH / 2]} rotation={[-Math.PI / 2, 0, 0]} position={[0.3, 0, ROAD_LENGTH / 4 + ROAD_WIDTH / 4]}><meshBasicMaterial color="#e6c229" /></Plane>
                <Plane args={[0.2, ROAD_LENGTH / 2 - ROAD_WIDTH / 2]} rotation={[-Math.PI / 2, 0, 0]} position={[-0.3, 0, -ROAD_LENGTH / 4 - ROAD_WIDTH / 4]}><meshBasicMaterial color="#e6c229" /></Plane>
                <Plane args={[0.2, ROAD_LENGTH / 2 - ROAD_WIDTH / 2]} rotation={[-Math.PI / 2, 0, 0]} position={[0.3, 0, -ROAD_LENGTH / 4 - ROAD_WIDTH / 4]}><meshBasicMaterial color="#e6c229" /></Plane>

                {/* White dashed lane lines — N/S arm */}
                {[-8, 8].map((xOff, i) => (
                    <Plane key={i} args={[0.18, ROAD_LENGTH / 2 - ROAD_WIDTH / 2]} rotation={[-Math.PI / 2, 0, 0]} position={[xOff, 0, ROAD_LENGTH / 4 + ROAD_WIDTH / 4]}>
                        <meshBasicMaterial color="#fff" transparent opacity={0.55} />
                    </Plane>
                ))}
                {[-8, 8].map((xOff, i) => (
                    <Plane key={i + 2} args={[0.18, ROAD_LENGTH / 2 - ROAD_WIDTH / 2]} rotation={[-Math.PI / 2, 0, 0]} position={[xOff, 0, -ROAD_LENGTH / 4 - ROAD_WIDTH / 4]}>
                        <meshBasicMaterial color="#fff" transparent opacity={0.55} />
                    </Plane>
                ))}

                {/* N/S stop lines */}
                <Plane args={[ROAD_WIDTH, 0.55]} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, STOP_LINE_DIST]}><meshBasicMaterial color="#fff" /></Plane>
                <Plane args={[ROAD_WIDTH, 0.55]} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -STOP_LINE_DIST]}><meshBasicMaterial color="#fff" /></Plane>
            </group>

            {/* East-West lane markings */}
            <group position={[0, 0.02, 0]}>
                {/* Centre double-yellow divider */}
                <Plane args={[ROAD_LENGTH / 2 - ROAD_WIDTH / 2, 0.2]} rotation={[-Math.PI / 2, 0, 0]} position={[ROAD_LENGTH / 4 + ROAD_WIDTH / 4, 0, -0.3]}><meshBasicMaterial color="#e6c229" /></Plane>
                <Plane args={[ROAD_LENGTH / 2 - ROAD_WIDTH / 2, 0.2]} rotation={[-Math.PI / 2, 0, 0]} position={[ROAD_LENGTH / 4 + ROAD_WIDTH / 4, 0, 0.3]}><meshBasicMaterial color="#e6c229" /></Plane>
                <Plane args={[ROAD_LENGTH / 2 - ROAD_WIDTH / 2, 0.2]} rotation={[-Math.PI / 2, 0, 0]} position={[-ROAD_LENGTH / 4 - ROAD_WIDTH / 4, 0, -0.3]}><meshBasicMaterial color="#e6c229" /></Plane>
                <Plane args={[ROAD_LENGTH / 2 - ROAD_WIDTH / 2, 0.2]} rotation={[-Math.PI / 2, 0, 0]} position={[-ROAD_LENGTH / 4 - ROAD_WIDTH / 4, 0, 0.3]}><meshBasicMaterial color="#e6c229" /></Plane>

                {/* White dashed lane lines — E/W arm */}
                {[-8, 8].map((zOff, i) => (
                    <Plane key={i} args={[ROAD_LENGTH / 2 - ROAD_WIDTH / 2, 0.18]} rotation={[-Math.PI / 2, 0, 0]} position={[ROAD_LENGTH / 4 + ROAD_WIDTH / 4, 0, zOff]}>
                        <meshBasicMaterial color="#fff" transparent opacity={0.55} />
                    </Plane>
                ))}
                {[-8, 8].map((zOff, i) => (
                    <Plane key={i + 2} args={[ROAD_LENGTH / 2 - ROAD_WIDTH / 2, 0.18]} rotation={[-Math.PI / 2, 0, 0]} position={[-ROAD_LENGTH / 4 - ROAD_WIDTH / 4, 0, zOff]}>
                        <meshBasicMaterial color="#fff" transparent opacity={0.55} />
                    </Plane>
                ))}

                {/* E/W stop lines */}
                <Plane args={[0.55, ROAD_WIDTH]} rotation={[-Math.PI / 2, 0, 0]} position={[STOP_LINE_DIST, 0, 0]}><meshBasicMaterial color="#fff" /></Plane>
                <Plane args={[0.55, ROAD_WIDTH]} rotation={[-Math.PI / 2, 0, 0]} position={[-STOP_LINE_DIST, 0, 0]}><meshBasicMaterial color="#fff" /></Plane>
            </group>
        </group>
    );
}

function TrafficLightPole({ direction, signalState, remainingTime, isEmergency }) {
    const POLE_H = 7;
    const BOX_H = 3.6;
    const BULB_R = 0.34;

    const posMap = {
        NORTH: { pos: [ROAD_WIDTH / 2 + 1.5, 0, STOP_LINE_DIST + 1.5], rotY: 0 },
        SOUTH: { pos: [-ROAD_WIDTH / 2 - 1.5, 0, -STOP_LINE_DIST - 1.5], rotY: Math.PI },
        EAST: { pos: [STOP_LINE_DIST + 1.5, 0, -ROAD_WIDTH / 2 - 1.5], rotY: -Math.PI / 2 },
        WEST: { pos: [-STOP_LINE_DIST - 1.5, 0, ROAD_WIDTH / 2 + 1.5], rotY: Math.PI / 2 },
    };
    const { pos, rotY } = posMap[direction] || posMap.NORTH;

    const isGreen = signalState === 'GREEN';
    const isAmber = signalState === 'AMBER';
    const isRed = !isGreen && !isAmber;

    const redColor = isRed ? '#ff2020' : '#1a0000';
    const amberColor = isAmber ? '#ffb800' : '#1a0e00';
    const greenColor = isGreen ? '#00e84b' : '#001a0a';
    const redEmissive = isRed ? '#ff2020' : '#000000';
    const amberEmissive = isAmber ? '#ffb800' : '#000000';
    const greenEmissive = isGreen ? '#00e84b' : '#000000';
    const glowIntensity = isRed ? 2.5 : isAmber ? 2.5 : isGreen ? 2.5 : 0;

    const activeColor = isGreen ? '#00e84b' : isAmber ? '#ffb800' : '#ff2020';

    return (
        <group position={pos} rotation={[0, rotY, 0]}>
            {/* Vertical pole */}
            <Cylinder args={[0.18, 0.2, POLE_H, 12]} position={[0, POLE_H / 2, 0]} castShadow>
                <meshStandardMaterial color="#2a2a2a" roughness={0.6} metalness={0.5} />
            </Cylinder>

            {/* Horizontal arm */}
            <Cylinder args={[0.1, 0.1, 3.5, 8]} position={[-1.75, POLE_H, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
                <meshStandardMaterial color="#2a2a2a" roughness={0.6} metalness={0.5} />
            </Cylinder>

            {/* Housing — facing toward road (negative Z direction) */}
            <group position={[-3.5, POLE_H, 0]}>
                {/* Dark housing box */}
                <Box args={[0.85, BOX_H, 0.85]} position={[0, 0, 0]} castShadow>
                    <meshStandardMaterial color="#1a1a1a" roughness={0.8} metalness={0.2} />
                </Box>

                {/* Direction label on top */}
                <Html position={[0, BOX_H / 2 + 0.6, 0]} center zIndexRange={[50, 0]}>
                    <div style={{
                        background: 'rgba(15,23,42,0.85)', color: '#94a3b8',
                        padding: '2px 6px', borderRadius: 4, fontSize: '11px',
                        fontWeight: 800, fontFamily: 'Inter,sans-serif',
                        letterSpacing: '1px', pointerEvents: 'none', userSelect: 'none',
                    }}>
                        {direction.slice(0, 1)}
                    </div>
                </Html>

                {/* RED bulb — top */}
                <Sphere args={[BULB_R, 24, 24]} position={[0, BOX_H / 2 - 0.55, 0.38]}>
                    <meshStandardMaterial color={redColor} emissive={redEmissive} emissiveIntensity={isRed ? glowIntensity : 0} roughness={0.2} />
                </Sphere>

                {/* AMBER bulb — middle */}
                <Sphere args={[BULB_R, 24, 24]} position={[0, 0, 0.38]}>
                    <meshStandardMaterial color={amberColor} emissive={amberEmissive} emissiveIntensity={isAmber ? glowIntensity : 0} roughness={0.2} />
                </Sphere>

                {/* GREEN bulb — bottom */}
                <Sphere args={[BULB_R, 24, 24]} position={[0, -(BOX_H / 2 - 0.55), 0.38]}>
                    <meshStandardMaterial color={greenColor} emissive={greenEmissive} emissiveIntensity={isGreen ? glowIntensity : 0} roughness={0.2} />
                </Sphere>

                {/* Visor shades above each bulb */}
                {[BOX_H / 2 - 0.55, 0, -(BOX_H / 2 - 0.55)].map((y, i) => (
                    <Box key={i} args={[0.78, 0.1, 0.45]} position={[0, y + 0.24, 0.55]} rotation={[0.35, 0, 0]}>
                        <meshStandardMaterial color="#111" roughness={0.9} />
                    </Box>
                ))}
            </group>

            {/* Green road glow — subtle PointLight cast downward onto asphalt */}
            {isGreen && (
                <pointLight
                    position={[-3.5, POLE_H - 1.5, 4]}
                    color="#00ff66"
                    intensity={6}
                    distance={22}
                    decay={2}
                />
            )}
            {isAmber && (
                <pointLight
                    position={[-3.5, POLE_H - 1.5, 4]}
                    color="#ffaa00"
                    intensity={3}
                    distance={14}
                    decay={2}
                />
            )}


        </group>
    );
}


// === VEHICLE MODELS ===
function Wheel({ position }) {
    return (
        <Cylinder args={[0.35, 0.35, 0.2, 16]} rotation={[0, 0, Math.PI / 2]} position={position} castShadow>
            <meshStandardMaterial color="#111" roughness={0.9} />
        </Cylinder>
    );
}

// ═══════════════════════════════════════════════════════════════
// ROAD SIGNAL GLOW — full road arm glow
// Covers the entire arm length with an emissive overlay + lights
// ═══════════════════════════════════════════════════════════════

// Road arm geometry constants
const ARM_LENGTH = ROAD_LENGTH / 2 - ROAD_WIDTH / 2; // e.g. 134 units
const ARM_CENTER = ROAD_WIDTH / 2 + ARM_LENGTH / 2;  // midpoint of the arm from origin

function RoadSignalGlow({ direction, signalState }) {
    const overlayRef = useRef();

    const isGreen = signalState === 'GREEN';
    const isAmber = signalState === 'AMBER';
    const isRed = !isGreen && !isAmber;

    const col = isGreen ? '#00ff55' : isAmber ? '#ffaa00' : '#ff2020';
    const lightCol = isGreen ? '#00ff66' : isAmber ? '#ffcc00' : '#ff3333';
    const baseEmit = isGreen ? 1.8 : isAmber ? 1.4 : 0.5;
    const opacity = isGreen ? 0.32 : isAmber ? 0.26 : 0.14;
    const lightInt = isGreen ? 18 : isAmber ? 11 : 4;
    const lightDist = isGreen ? 50 : isAmber ? 36 : 22;

    // Smooth animated pulse on the overlay
    useFrame(({ clock }) => {
        if (overlayRef.current) {
            const t = clock.getElapsedTime();
            const pulse = isGreen
                ? 0.82 + 0.18 * Math.sin(t * 2.2)
                : isAmber
                    ? 0.65 + 0.35 * Math.abs(Math.sin(t * 4.5))
                    : 1.0;
            overlayRef.current.emissiveIntensity = baseEmit * pulse;
            overlayRef.current.opacity = opacity * (isRed ? 1 : pulse * 0.9 + 0.1);
        }
    });

    // Full-arm overlay plane + 4 distributed lights along the arm
    // NORTH: +Z axis, SOUTH: -Z axis, EAST: +X axis, WEST: -X axis
    const isNS = direction === 'NORTH' || direction === 'SOUTH';
    const sign = (direction === 'NORTH' || direction === 'EAST') ? 1 : -1;

    // Overlay covers the full arm
    const planeW = isNS ? ROAD_WIDTH : ARM_LENGTH;
    const planeH = isNS ? ARM_LENGTH : ROAD_WIDTH;
    const overlayX = isNS ? 0 : sign * ARM_CENTER;
    const overlayZ = isNS ? sign * ARM_CENTER : 0;

    // 4 point lights spaced evenly along the arm
    const lightPositions = [0.15, 0.38, 0.62, 0.85].map(t => {
        const d = STOP_LINE_DIST + t * ARM_LENGTH;
        return isNS
            ? [0, 8, sign * d]
            : [sign * d, 8, 0];
    });

    return (
        <group>
            {/* Full road arm emissive overlay */}
            <Plane
                args={[planeW, planeH]}
                rotation={[-Math.PI / 2, 0, 0]}
                position={[overlayX, 0.04, overlayZ]}
            >
                <meshStandardMaterial
                    ref={overlayRef}
                    color={col}
                    emissive={col}
                    emissiveIntensity={baseEmit}
                    roughness={0.6}
                    transparent
                    opacity={opacity}
                    depthWrite={false}
                />
            </Plane>

            {/* Intersection centre patch */}
            <Plane
                args={[ROAD_WIDTH, ROAD_WIDTH]}
                rotation={[-Math.PI / 2, 0, 0]}
                position={[0, 0.05, 0]}
            >
                <meshStandardMaterial
                    color={col}
                    emissive={col}
                    emissiveIntensity={baseEmit * 0.6}
                    roughness={0.6}
                    transparent
                    opacity={opacity * 0.7}
                    depthWrite={false}
                />
            </Plane>

            {/* Distributed point lights flooding the whole arm */}
            {lightPositions.map((lp, i) => (
                <pointLight
                    key={i}
                    position={lp}
                    color={lightCol}
                    intensity={lightInt}
                    distance={lightDist}
                    decay={2}
                />
            ))}
        </group>
    );
}

function CarModel({ vehicle }) {
    const { length, color } = vehicle;
    const wZ = length / 2 - 0.6;
    return (
        <group>
            {/* Main Body */}
            <Box args={[1.8, 0.7, length]} position={[0, 0.5, 0]} castShadow receiveShadow>
                <meshStandardMaterial color={color} metalness={0.8} roughness={0.1} />
            </Box>
            {/* Cabin */}
            <Box args={[1.4, 0.6, length * 0.45]} position={[0, 1.15, -0.2]} castShadow receiveShadow>
                <meshStandardMaterial color={color} metalness={0.8} roughness={0.1} />
            </Box>

            {/* Windows */}
            <Plane args={[1.3, 0.5]} position={[0, 1.15, -0.2 - length * 0.225 - 0.01]} rotation={[0, Math.PI, 0]}><meshStandardMaterial color="#222" roughness={0.0} metalness={1.0} /></Plane>
            <Plane args={[1.3, 0.5]} position={[0, 1.15, -0.2 + length * 0.225 + 0.01]}><meshStandardMaterial color="#222" roughness={0.0} metalness={1.0} /></Plane>

            {/* Wheels */}
            <Wheel position={[-0.95, 0.35, wZ]} />
            <Wheel position={[0.95, 0.35, wZ]} />
            <Wheel position={[-0.95, 0.35, -wZ]} />
            <Wheel position={[0.95, 0.35, -wZ]} />

            {/* Headlights (Front is -Z direction) */}
            <Box args={[0.5, 0.25, 0.1]} position={[0.6, 0.55, -length / 2 - 0.05]}><meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={2} /></Box>
            <Box args={[0.5, 0.25, 0.1]} position={[-0.6, 0.55, -length / 2 - 0.05]}><meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={2} /></Box>

            {/* Taillights (Rear is +Z direction) */}
            <Box args={[0.5, 0.25, 0.1]} position={[0.6, 0.55, length / 2 + 0.05]}><meshStandardMaterial color="#ff0000" emissive={vehicle.speed < vehicle.targetSpeed - 0.005 ? "#ff0000" : "#550000"} emissiveIntensity={vehicle.speed < vehicle.targetSpeed - 0.005 ? 3 : 1} /></Box>
            <Box args={[0.5, 0.25, 0.1]} position={[-0.6, 0.55, length / 2 + 0.05]}><meshStandardMaterial color="#ff0000" emissive={vehicle.speed < vehicle.targetSpeed - 0.005 ? "#ff0000" : "#550000"} emissiveIntensity={vehicle.speed < vehicle.targetSpeed - 0.005 ? 3 : 1} /></Box>
        </group>
    );
}

function TruckModel({ vehicle }) {
    const { length } = vehicle;
    const wZ = length / 2 - 1.0;
    return (
        <group>
            {/* Trailer */}
            <Box args={[2.4, 3, length - 2.5]} position={[0, 2.0, 1.25]} castShadow receiveShadow><meshStandardMaterial color="#f4f4f4" roughness={0.6} /></Box>
            {/* Cab */}
            <Box args={[2.4, 2.5, 2.2]} position={[0, 1.75, -length / 2 + 1.1]} castShadow receiveShadow><meshStandardMaterial color={vehicle.color} metalness={0.5} roughness={0.3} /></Box>
            {/* Windshield */}
            <Plane args={[2.2, 1]} position={[0, 2.5, -length / 2 + 0.01]} rotation={[-Math.PI / 12, Math.PI, 0]}><meshStandardMaterial color="#111" metalness={1.0} roughness={0.0} /></Plane>

            {/* Wheels */}
            <Wheel position={[-1.25, 0.5, -length / 2 + 1.1]} />
            <Wheel position={[1.25, 0.5, -length / 2 + 1.1]} />
            <Wheel position={[-1.25, 0.5, 1]} />
            <Wheel position={[1.25, 0.5, 1]} />
            <Wheel position={[-1.25, 0.5, wZ]} />
            <Wheel position={[1.25, 0.5, wZ]} />

            {/* Headlights */}
            <Box args={[0.5, 0.3, 0.1]} position={[0.8, 0.8, -length / 2 + 0.01]}><meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={2} /></Box>
            <Box args={[0.5, 0.3, 0.1]} position={[-0.8, 0.8, -length / 2 + 0.01]}><meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={2} /></Box>

            {/* Taillights */}
            <Box args={[0.7, 0.2, 0.1]} position={[0.7, 0.8, length / 2 + 0.05]}><meshStandardMaterial color="#ff0000" emissive={vehicle.speed < vehicle.targetSpeed - 0.005 ? "#ff0000" : "#550000"} emissiveIntensity={vehicle.speed < vehicle.targetSpeed - 0.005 ? 3 : 1} /></Box>
            <Box args={[0.7, 0.2, 0.1]} position={[-0.7, 0.8, length / 2 + 0.05]}><meshStandardMaterial color="#ff0000" emissive={vehicle.speed < vehicle.targetSpeed - 0.005 ? "#ff0000" : "#550000"} emissiveIntensity={vehicle.speed < vehicle.targetSpeed - 0.005 ? 3 : 1} /></Box>
        </group>
    );
}

function AmbulanceModel({ vehicle }) {
    const { length } = vehicle;
    const sirenRef = useRef();
    useFrame(({ clock }) => {
        if (sirenRef.current) {
            const t = clock.getElapsedTime() * 12;
            const isRed = Math.sin(t) > 0;
            sirenRef.current.children[0].material.emissiveIntensity = isRed ? 2 : 0;
            sirenRef.current.children[1].material.emissiveIntensity = !isRed ? 2 : 0;
        }
    });

    const wZ = length / 2 - 0.8;
    return (
        <group>
            <Box args={[2.0, 2.0, length]} position={[0, 1.5, 0]} castShadow receiveShadow><meshStandardMaterial color="#ffffff" metalness={0.2} roughness={0.3} /></Box>
            {/* Windshield */}
            <Plane args={[1.8, 0.8]} position={[0, 1.8, -length / 2 - 0.01]} rotation={[0, Math.PI, 0]}><meshStandardMaterial color="#111" roughness={0.0} metalness={1.0} /></Plane>
            {/* Red Cross */}
            <Box args={[2.05, 0.8, 0.3]} position={[0, 1.5, 0]}><meshStandardMaterial color="#dd0000" /></Box>
            <Box args={[2.05, 0.3, 0.8]} position={[0, 1.5, 0]}><meshStandardMaterial color="#dd0000" /></Box>
            {/* Sirens */}
            <group ref={sirenRef} position={[0, 2.6, -1]}>
                <Box args={[0.6, 0.2, 0.4]} position={[0.4, 0, 0]}><meshStandardMaterial color="#ff0000" emissive="#ff0000" /></Box>
                <Box args={[0.6, 0.2, 0.4]} position={[-0.4, 0, 0]}><meshStandardMaterial color="#0000ff" emissive="#0000ff" /></Box>
            </group>
            {/* Wheels */}
            <Wheel position={[-1.05, 0.4, wZ]} />
            <Wheel position={[1.05, 0.4, wZ]} />
            <Wheel position={[-1.05, 0.4, -wZ]} />
            <Wheel position={[1.05, 0.4, -wZ]} />

            {/* Headlights */}
            <Box args={[0.4, 0.25, 0.1]} position={[0.7, 0.8, -length / 2 - 0.05]}><meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={2} /></Box>
            <Box args={[0.4, 0.25, 0.1]} position={[-0.7, 0.8, -length / 2 - 0.05]}><meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={2} /></Box>
            {/* Taillights */}
            <Box args={[0.4, 0.25, 0.1]} position={[0.7, 0.8, length / 2 + 0.05]}><meshStandardMaterial color="#ff0000" emissive={vehicle.speed < vehicle.targetSpeed - 0.005 ? "#ff0000" : "#550000"} emissiveIntensity={vehicle.speed < vehicle.targetSpeed - 0.005 ? 3 : 1} /></Box>
            <Box args={[0.4, 0.25, 0.1]} position={[-0.7, 0.8, length / 2 + 0.05]}><meshStandardMaterial color="#ff0000" emissive={vehicle.speed < vehicle.targetSpeed - 0.005 ? "#ff0000" : "#550000"} emissiveIntensity={vehicle.speed < vehicle.targetSpeed - 0.005 ? 3 : 1} /></Box>
        </group>
    );
}

function VehicleObject({ vehicle }) {
    const ref = useRef();
    useFrame(() => {
        if (ref.current && vehicle) {
            ref.current.position.set(vehicle.x, 0, vehicle.z);
            ref.current.rotation.set(0, vehicle.rotY, 0);
        }
    });

    if (!vehicle) return null;

    return (
        <group ref={ref}>
            {vehicle.type === 'car' && <CarModel vehicle={vehicle} />}
            {vehicle.type === 'truck' && <TruckModel vehicle={vehicle} />}
            {vehicle.type === 'ambulance' && <AmbulanceModel vehicle={vehicle} />}
        </group>
    )
}

// === LOGIC UTILS ===

// Direction → lane indices map (for manual spawning)
const DIR_LANES = {
    NORTH: [0, 1],
    SOUTH: [2, 3],
    WEST: [4, 5],
    EAST: [6, 7],
};

// ═══════════════════════════════════════════════════════════════
// URBAN ENVIRONMENT
// Buildings, sidewalks, trees, street lamps around the intersection
// ═══════════════════════════════════════════════════════════════

function Tree({ x, z, scale = 1 }) {
    return (
        <group position={[x, 0, z]}>
            <Cylinder args={[0.25 * scale, 0.35 * scale, 2.2 * scale, 7]} position={[0, 1.1 * scale, 0]} castShadow>
                <meshStandardMaterial color="#5C3D1E" roughness={0.9} />
            </Cylinder>
            <Sphere args={[2.2 * scale, 9, 9]} position={[0, 3.8 * scale, 0]} castShadow>
                <meshStandardMaterial color="#1a7a30" roughness={0.85} />
            </Sphere>
            <Sphere args={[1.5 * scale, 8, 8]} position={[1.2 * scale, 4.5 * scale, 0.8 * scale]} castShadow>
                <meshStandardMaterial color="#22883a" roughness={0.85} />
            </Sphere>
        </group>
    );
}

function StreetLamp({ x, z, rotY = 0 }) {
    return (
        <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
            <Cylinder args={[0.12, 0.15, 6.5, 8]} position={[0, 3.25, 0]}>
                <meshStandardMaterial color="#444" metalness={0.7} roughness={0.3} />
            </Cylinder>
            <Cylinder args={[0.08, 0.08, 2.2, 8]} position={[1.1, 6.4, 0]} rotation={[0, 0, Math.PI / 6]}>
                <meshStandardMaterial color="#444" metalness={0.7} roughness={0.3} />
            </Cylinder>
            <Box args={[0.7, 0.25, 0.4]} position={[2.0, 6.7, 0]}>
                <meshStandardMaterial color="#fffbe6" emissive="#ffe57f" emissiveIntensity={1.5} roughness={0.3} />
            </Box>
            <pointLight position={[2.0, 6.3, 0]} color="#ffe0a0" intensity={6} distance={22} decay={2} />
        </group>
    );
}



function UrbanEnvironment() {
    const RW = ROAD_WIDTH;
    const pad = 6; // sidewalk width
    const armLen = ROAD_LENGTH / 2;

    // Sidewalk planes alongside each road arm
    const sidewalks = [
        // North arm — east sidewalk
        { args: [pad, armLen], pos: [RW / 2 + pad / 2, 0.02, armLen / 2 + RW / 2 / 2] },
        // North arm — west sidewalk
        { args: [pad, armLen], pos: [-(RW / 2 + pad / 2), 0.02, armLen / 2 + RW / 2 / 2] },
        // South arm — east
        { args: [pad, armLen], pos: [RW / 2 + pad / 2, 0.02, -(armLen / 2 + RW / 2 / 2)] },
        // South arm — west
        { args: [pad, armLen], pos: [-(RW / 2 + pad / 2), 0.02, -(armLen / 2 + RW / 2 / 2)] },
        // East arm — north sidewalk
        { args: [armLen, pad], pos: [armLen / 2 + RW / 2 / 2, 0.02, RW / 2 + pad / 2] },
        // East arm — south sidewalk
        { args: [armLen, pad], pos: [armLen / 2 + RW / 2 / 2, 0.02, -(RW / 2 + pad / 2)] },
        // West arm — north
        { args: [armLen, pad], pos: [-(armLen / 2 + RW / 2 / 2), 0.02, RW / 2 + pad / 2] },
        // West arm — south
        { args: [armLen, pad], pos: [-(armLen / 2 + RW / 2 / 2), 0.02, -(RW / 2 + pad / 2)] },
    ];

    // Corner grass patches (fill the 4 quadrant corners)
    const O = RW / 2 + pad; // offset to corner start
    const cornerSize = 100;
    const corners = [
        [O + cornerSize / 2, O + cornerSize / 2],
        [-O - cornerSize / 2, O + cornerSize / 2],
        [O + cornerSize / 2, -O - cornerSize / 2],
        [-O - cornerSize / 2, -O - cornerSize / 2],
    ];



    // Trees along sidewalks
    const trees = [
        // North arm trees
        ...[30, 60, 90, 115].map(z => ({ x: RW / 2 + 3, z })),
        ...[30, 60, 90, 115].map(z => ({ x: -RW / 2 - 3, z })),
        ...[30, 60, 90, 115].map(z => ({ x: RW / 2 + 3, z: -z })),
        ...[30, 60, 90, 115].map(z => ({ x: -RW / 2 - 3, z: -z })),
        // East arm trees
        ...[30, 60, 90, 115].map(x => ({ x, z: RW / 2 + 3 })),
        ...[30, 60, 90, 115].map(x => ({ x, z: -RW / 2 - 3 })),
        ...[30, 60, 90, 115].map(x => ({ x: -x, z: RW / 2 + 3 })),
        ...[30, 60, 90, 115].map(x => ({ x: -x, z: -RW / 2 - 3 })),
    ];

    // Street lamps along each arm
    const lamps = [
        ...[20, 50, 80, 110].map(z => ({ x: RW / 2 + 4.5, z, rotY: 0 })),
        ...[20, 50, 80, 110].map(z => ({ x: -RW / 2 - 4.5, z, rotY: Math.PI })),
        ...[20, 50, 80, 110].map(z => ({ x: RW / 2 + 4.5, z: -z, rotY: 0 })),
        ...[20, 50, 80, 110].map(z => ({ x: -RW / 2 - 4.5, z: -z, rotY: Math.PI })),
        ...[20, 50, 80, 110].map(x => ({ x, z: RW / 2 + 4.5, rotY: -Math.PI / 2 })),
        ...[20, 50, 80, 110].map(x => ({ x, z: -RW / 2 - 4.5, rotY: Math.PI / 2 })),
        ...[20, 50, 80, 110].map(x => ({ x: -x, z: RW / 2 + 4.5, rotY: -Math.PI / 2 })),
        ...[20, 50, 80, 110].map(x => ({ x: -x, z: -RW / 2 - 4.5, rotY: Math.PI / 2 })),
    ];

    return (
        <group>
            {/* Sidewalk planes */}
            {sidewalks.map((s, i) => (
                <Plane key={i} args={s.args} rotation={[-Math.PI / 2, 0, 0]} position={s.pos} receiveShadow>
                    <meshStandardMaterial color="#b0b8c1" roughness={0.95} />
                </Plane>
            ))}

            {/* Corner grass */}
            {corners.map(([cx, cz], i) => (
                <Plane key={i} args={[cornerSize, cornerSize]} rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.01, cz]} receiveShadow>
                    <meshStandardMaterial color="#3d7a3a" roughness={0.95} />
                </Plane>
            ))}



            {/* Trees */}
            {trees.map((t, i) => (
                <Tree key={i} x={t.x} z={t.z} scale={0.8 + Math.sin(i * 3.7) * 0.2} />
            ))}

            {/* Street lamps */}
            {lamps.map((l, i) => (
                <StreetLamp key={i} x={l.x} z={l.z} rotY={l.rotY} />
            ))}
        </group>
    );
}

function getLaneParams(laneIndex) {
    // N/S: lane offsets at ±15 (outer) and ±5 (inner) for ROAD_WIDTH=40
    if (laneIndex === 0) return { dirX: 0, dirZ: 1, startX: -15, startZ: -SPAWN_DIST }; // Southbound Outer
    if (laneIndex === 1) return { dirX: 0, dirZ: 1, startX: -5, startZ: -SPAWN_DIST }; // Southbound Inner
    if (laneIndex === 2) return { dirX: 0, dirZ: -1, startX: 5, startZ: SPAWN_DIST }; // Northbound Inner
    if (laneIndex === 3) return { dirX: 0, dirZ: -1, startX: 15, startZ: SPAWN_DIST }; // Northbound Outer

    // E/W: lane offsets at ±15 (outer) and ±5 (inner)
    if (laneIndex === 4) return { dirX: 1, dirZ: 0, startX: -SPAWN_DIST, startZ: 15 }; // Eastbound Outer
    if (laneIndex === 5) return { dirX: 1, dirZ: 0, startX: -SPAWN_DIST, startZ: 5 }; // Eastbound Inner
    if (laneIndex === 6) return { dirX: -1, dirZ: 0, startX: SPAWN_DIST, startZ: -5 }; // Westbound Inner
    if (laneIndex === 7) return { dirX: -1, dirZ: 0, startX: SPAWN_DIST, startZ: -15 }; // Westbound Outer
    return { dirX: 0, dirZ: 0, startX: 0, startZ: 0 };
}

function getRandomTurn(laneIndex) {
    const isOuter = [0, 3, 4, 7].includes(laneIndex);
    const r = Math.random();
    if (isOuter) {
        if (r < 0.3) return 'RIGHT';
        return 'STRAIGHT';
    } else { // Inner
        if (r < 0.25) return 'LEFT';
        if (r < 0.3) return 'UTURN';
        return 'STRAIGHT';
    }
}

function createVehicle(laneIndex, forceType = null) {
    const params = getLaneParams(laneIndex);
    const rand = Math.random();

    let type = forceType || 'car';
    let length = 4.0;
    const variance = (0.85 + Math.random() * 0.3);
    let maxSpeed = BASE_SPEED * variance;

    if (!forceType) {
        if (rand > 0.74) { type = 'truck'; length = 9.0; maxSpeed = BASE_SPEED * 1.1; }
    } else {
        if (type === 'truck') { length = 9.0; maxSpeed = BASE_SPEED * 1.1; }
        else if (type === 'ambulance') { length = 5.0; maxSpeed = BASE_SPEED * 2.5; }
    }

    const turnIntent = type === 'ambulance' ? 'STRAIGHT' : getRandomTurn(laneIndex);

    return {
        id: (forceType === 'ambulance' ? 'amb_' : '') + Math.random().toString(),
        lane: laneIndex,
        dirX: params.dirX,
        dirZ: params.dirZ,
        type: type,
        length: length,
        x: params.startX,
        z: params.startZ,
        rotY: Math.atan2(params.dirX, params.dirZ) + Math.PI,
        speed: maxSpeed * (type === 'ambulance' ? 0.8 : 0.5),
        targetSpeed: maxSpeed,
        maxSpeed: maxSpeed,
        color: type === 'ambulance' ? '#ffffff' : new THREE.Color().setHSL(Math.random(), 0.8, 0.4).getStyle(),
        turnIntent: turnIntent,
        turnProgress: 0,
        state: 'APPROACHING'
    };
}

function getDist(carA, carB) {
    return Math.sqrt(Math.pow(carA.x - carB.x, 2) + Math.pow(carA.z - carB.z, 2));
}

function getTurnCurve(car) {
    let p2 = { x: 0, z: 0 }; let p1 = { x: 0, z: 0 };
    const D = STOP_LINE_DIST;
    let newDirX = 0; let newDirZ = 0;

    if (car.turnIntent === 'RIGHT') {
        if (car.dirZ === 1) { p2 = { x: -D, z: -7.5 }; p1 = { x: -7.5, z: -7.5 }; newDirX = -1; }
        else if (car.dirZ === -1) { p2 = { x: D, z: 7.5 }; p1 = { x: 7.5, z: 7.5 }; newDirX = 1; }
        else if (car.dirX === 1) { p2 = { x: -7.5, z: D }; p1 = { x: -7.5, z: 7.5 }; newDirZ = 1; }
        else if (car.dirX === -1) { p2 = { x: 7.5, z: -D }; p1 = { x: 7.5, z: -7.5 }; newDirZ = -1; }
    } else if (car.turnIntent === 'LEFT') {
        if (car.dirZ === 1) { p2 = { x: D, z: 2.5 }; p1 = { x: -2.5, z: 2.5 }; newDirX = 1; }
        else if (car.dirZ === -1) { p2 = { x: -D, z: -2.5 }; p1 = { x: 2.5, z: -2.5 }; newDirX = -1; }
        else if (car.dirX === 1) { p2 = { x: 2.5, z: -D }; p1 = { x: 2.5, z: 2.5 }; newDirZ = -1; }
        else if (car.dirX === -1) { p2 = { x: -2.5, z: D }; p1 = { x: -2.5, z: -2.5 }; newDirZ = 1; }
    } else if (car.turnIntent === 'UTURN') {
        if (car.dirZ === 1) { p2 = { x: 2.5, z: -D }; p1 = { x: 0, z: -10 }; newDirZ = -1; }
        else if (car.dirZ === -1) { p2 = { x: -2.5, z: D }; p1 = { x: 0, z: 10 }; newDirZ = 1; }
        else if (car.dirX === 1) { p2 = { x: -D, z: -2.5 }; p1 = { x: 10, z: 0 }; newDirX = -1; }
        else if (car.dirX === -1) { p2 = { x: D, z: 2.5 }; p1 = { x: -10, z: 0 }; newDirX = 1; }
    }
    return { p1, p2, newDirX, newDirZ };
}

function processLane(vehicles, lightState) {
    let needsRender = false;

    for (let i = 0; i < vehicles.length; i++) {
        const car = vehicles[i];
        let targetSpeed = car.maxSpeed;
        const isAmbulance = car.type === 'ambulance';

        let distToStop = 0;
        if (car.state === 'APPROACHING') {
            if (car.dirZ === 1) distToStop = -STOP_LINE_DIST - car.z;
            else if (car.dirZ === -1) distToStop = car.z - STOP_LINE_DIST;
            else if (car.dirX === 1) distToStop = -STOP_LINE_DIST - car.x;
            else if (car.dirX === -1) distToStop = car.x - STOP_LINE_DIST;

            if (distToStop <= 0 && distToStop > -30) car.state = 'INTERSECTION';
        }

        if (car.state === 'INTERSECTION') {
            if (car.dirZ === 1 && car.z > STOP_LINE_DIST + 5) car.state = 'EXITED';
            else if (car.dirZ === -1 && car.z < -STOP_LINE_DIST - 5) car.state = 'EXITED';
            else if (car.dirX === 1 && car.x > STOP_LINE_DIST + 5) car.state = 'EXITED';
            else if (car.dirX === -1 && car.x < -STOP_LINE_DIST - 5) car.state = 'EXITED';
        }

        let canGo = false;
        if (car.dirZ === 1 && (lightState === 'NORTH_GREEN' || lightState === 'NORTH_AMBER')) canGo = true;
        else if (car.dirZ === -1 && (lightState === 'SOUTH_GREEN' || lightState === 'SOUTH_AMBER')) canGo = true;
        else if (car.dirX === 1 && (lightState === 'WEST_GREEN' || lightState === 'WEST_AMBER')) canGo = true;
        else if (car.dirX === -1 && (lightState === 'EAST_GREEN' || lightState === 'EAST_AMBER')) canGo = true;

        if (car.state === 'APPROACHING') {
            if (!canGo && distToStop > 0 && distToStop < 40) {
                targetSpeed = 0;
                if (distToStop < 1.0) {
                    targetSpeed = 0;
                    car.speed = 0;
                    if (car.dirZ === 1) car.z = -STOP_LINE_DIST - 1.0;
                    else if (car.dirZ === -1) car.z = STOP_LINE_DIST + 1.0;
                    else if (car.dirX === 1) car.x = -STOP_LINE_DIST - 1.0;
                    else if (car.dirX === -1) car.x = STOP_LINE_DIST + 1.0;
                }
            }
        }

        if (i > 0) {
            const carInFront = vehicles[i - 1];
            const dist = getDist(car, carInFront) - (car.length / 2 + carInFront.length / 2 + 0.5);
            if (dist < SAFE_DISTANCE * 3) targetSpeed = Math.min(targetSpeed, carInFront.speed);
            if (dist < SAFE_DISTANCE) targetSpeed = 0;
            if (dist < 0.5) { car.speed = 0; targetSpeed = 0; }
        }

        car.targetSpeed = targetSpeed;

        if (car.speed < targetSpeed) {
            car.speed = Math.min(car.speed + ACCEL, targetSpeed);
        } else if (car.speed > targetSpeed) {
            car.speed = Math.max(car.speed - DECEL * (isAmbulance ? 2 : 1), targetSpeed);
        }

        if (car.state === 'INTERSECTION' && car.turnIntent !== 'STRAIGHT') {
            if (!car.curve) {
                const { p1, p2, newDirX, newDirZ } = getTurnCurve(car);
                car.curve = { p0: { x: car.x, z: car.z }, p1, p2, newDirX, newDirZ };
                const R = Math.max(Math.abs(car.curve.p1.x - car.curve.p0.x), Math.abs(car.curve.p1.z - car.curve.p0.z));
                const length = car.turnIntent === 'UTURN' ? Math.PI * 4 : (Math.PI / 2 * R);
                car.curveLength = Math.max(length, 1);
            }

            car.turnProgress += (car.speed) / car.curveLength;
            if (car.turnProgress >= 1) {
                car.turnProgress = 1;
                car.state = 'EXITED';
                car.dirX = car.curve.newDirX;
                car.dirZ = car.curve.newDirZ;
                car.turnIntent = 'STRAIGHT';
            }

            const t = car.turnProgress;
            const u = 1 - t;
            const tt = t * t;
            const uu = u * u;
            car.x = uu * car.curve.p0.x + 2 * u * t * car.curve.p1.x + tt * car.curve.p2.x;
            car.z = uu * car.curve.p0.z + 2 * u * t * car.curve.p1.z + tt * car.curve.p2.z;

            const tanX = 2 * u * (car.curve.p1.x - car.curve.p0.x) + 2 * t * (car.curve.p2.x - car.curve.p1.x);
            const tanZ = 2 * u * (car.curve.p1.z - car.curve.p0.z) + 2 * t * (car.curve.p2.z - car.curve.p1.z);
            car.rotY = Math.atan2(tanX, tanZ) + Math.PI;

        } else {
            car.x += car.speed * car.dirX;
            car.z += car.speed * car.dirZ;
            car.rotY = Math.atan2(car.dirX, car.dirZ) + Math.PI;
        }
    }

    if (vehicles.length > 0) {
        const c = vehicles[0];
        const outOfBounds = Math.abs(c.x) > SPAWN_DIST + 10 || Math.abs(c.z) > SPAWN_DIST + 10;
        if (outOfBounds) {
            vehicles.shift();
            needsRender = true;
        }
    }

    return needsRender;
}

function VehicleManager({ lightState, setLaneCounts, simRunning, signalMode, spawnEvent }) {
    const lanesRef = useRef([[], [], [], [], [], [], [], []]);
    const laneDensitiesRef = useRef([0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4]);
    const [, setRenderTrigger] = useState(0);

    // Randomize lane generation densities to create uneven traffic loads
    useEffect(() => {
        const interval = setInterval(() => {
            if (!simRunning) return;
            if (signalMode === 'DENSITY') {
                // Generate exaggerated extreme imbalances for the AI to react to
                laneDensitiesRef.current = Array.from({ length: 8 }).map(() =>
                    Math.random() < 0.25 ? 0.85 + Math.random() * 0.15 : Math.random() * 0.1
                );
            } else {
                // Gentle realistic traffic for Time Based mode
                laneDensitiesRef.current = laneDensitiesRef.current.map(() => 0.1 + Math.random() * 0.8);
            }
        }, 4000);
        return () => clearInterval(interval);
    }, [simRunning, signalMode]);

    // Dynamic Spawning
    useEffect(() => {
        const interval = setInterval(() => {
            if (!simRunning) return; // Freeze spawning
            let spawned = false;
            for (let laneIdx = 0; laneIdx < 8; laneIdx++) {
                const lane = lanesRef.current[laneIdx];

                let canSpawn = false;
                if (lane.length === 0) canSpawn = true;
                else {
                    const lastCar = lane[lane.length - 1];
                    const { dirX, dirZ, startX, startZ } = getLaneParams(laneIdx);

                    let dist = 0;
                    if (dirZ === 1) dist = lastCar.z - startZ;
                    else if (dirZ === -1) dist = startZ - lastCar.z;
                    else if (dirX === 1) dist = lastCar.x - startX;
                    else if (dirX === -1) dist = startX - lastCar.x;

                    if (dist > SAFE_DISTANCE * 2 + lastCar.length * 2) canSpawn = true;
                }

                if (canSpawn && Math.random() < laneDensitiesRef.current[laneIdx]) {
                    lane.push(createVehicle(laneIdx));
                    spawned = true;
                }
            }
            if (spawned) setRenderTrigger(v => v + 1);
        }, 1500);
        return () => clearInterval(interval);
    }, [simRunning]);
    // Manual spawn triggered from UI
    useEffect(() => {
        if (!spawnEvent) return;
        const { type, direction, count } = spawnEvent;
        const laneIndices = DIR_LANES[direction] || [];
        let spawned = 0;
        for (let attempt = 0; spawned < count && attempt < count * 4; attempt++) {
            const laneIdx = laneIndices[spawned % laneIndices.length];
            lanesRef.current[laneIdx].push(createVehicle(laneIdx, type));
            spawned++;
        }
        setRenderTrigger(v => v + 1);
    }, [spawnEvent]);

    useEffect(() => {
        if (!simRunning) return;
        let timeoutId;

        function scheduleNextAmbulance() {
            const delay = (25 + Math.random() * 25) * 1000;
            timeoutId = setTimeout(() => {
                const anyAmbulanceActive = lanesRef.current.some(lane =>
                    lane.some(car => car.type === 'ambulance')
                );
                if (!anyAmbulanceActive) {
                    const laneIdx = Math.floor(Math.random() * 8);
                    lanesRef.current[laneIdx].push(createVehicle(laneIdx, 'ambulance'));
                }
                scheduleNextAmbulance();
            }, delay);
        }

        scheduleNextAmbulance();
        return () => clearTimeout(timeoutId);
    }, [simRunning]);

    useEffect(() => {
        if (!setLaneCounts) return;
        const countInterval = setInterval(() => {
            setLaneCounts(lanesRef.current.map(lane =>
                lane.filter(car => car.state === 'APPROACHING').length
            ));
        }, 500);
        return () => clearInterval(countInterval);
    }, [setLaneCounts]);

    useEffect(() => {
        if (!simRunning) return;
        const activeAmbulanceDirs = new Set();
        // Lane index → signal direction (matches processLane lightState checks):
        // 0,1 → dirZ=+1 → NORTH_GREEN controls them
        // 2,3 → dirZ=-1 → SOUTH_GREEN controls them
        // 4,5 → dirX=+1 → EAST_GREEN controls them
        // 6,7 → dirX=-1 → WEST_GREEN controls them
        const laneToDir = [
            'NORTH', 'NORTH',
            'SOUTH', 'SOUTH',
            'WEST', 'WEST',
            'EAST', 'EAST',
        ];

        const ambulanceInterval = setInterval(() => {
            const nowActive = new Set();
            lanesRef.current.forEach((lane, laneIdx) => {
                const approachingAmbulance = lane.find(
                    car => car.type === 'ambulance' && (car.state === 'APPROACHING' || car.state === 'INTERSECTION')
                );

                if (approachingAmbulance) {
                    const { dirX, dirZ, startX, startZ } = getLaneParams(laneIdx);
                    let distToStop = 0;
                    if (dirZ === 1) distToStop = -STOP_LINE_DIST - approachingAmbulance.z;
                    else if (dirZ === -1) distToStop = approachingAmbulance.z - STOP_LINE_DIST;
                    else if (dirX === 1) distToStop = -STOP_LINE_DIST - approachingAmbulance.x;
                    else if (dirX === -1) distToStop = approachingAmbulance.x - STOP_LINE_DIST;

                    // Only trigger signal preemption when within 80 units of the stop line
                    // But keep it active if it has already entered the intersection
                    if (distToStop < 80 || approachingAmbulance.state === 'INTERSECTION') {
                        nowActive.add(laneToDir[laneIdx]);
                    }
                }
            });

            for (const dir of nowActive) {
                if (!activeAmbulanceDirs.has(dir)) {
                    activeAmbulanceDirs.add(dir);
                    fetch('http://localhost:8000/api/ambulance', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ direction: dir, active: true })
                    }).catch(() => { });
                }
            }

            for (const dir of [...activeAmbulanceDirs]) {
                if (!nowActive.has(dir)) {
                    activeAmbulanceDirs.delete(dir);
                    fetch('http://localhost:8000/api/ambulance', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ direction: dir, active: false })
                    }).catch(() => { });
                }
            }
        }, 500);

        return () => {
            clearInterval(ambulanceInterval);
            for (const dir of activeAmbulanceDirs) {
                fetch('http://localhost:8000/api/ambulance', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ direction: dir, active: false })
                }).catch(() => { });
            }
        };
    }, [simRunning]);

    useFrame(() => {
        if (!simRunning) return; // Freeze physics and movement

        let anyNeedsRender = false;
        for (let laneIdx = 0; laneIdx < 8; laneIdx++) {
            if (processLane(lanesRef.current[laneIdx], lightState)) {
                anyNeedsRender = true;
            }
        }
        if (anyNeedsRender) setRenderTrigger(v => v + 1);
    });

    const allCars = lanesRef.current.flat();
    return <group>{allCars.map(car => <VehicleObject key={car.id} vehicle={car} />)}</group>;
}

function CompassUpdater({ compassRef }) {
    useFrame(({ camera }) => {
        if (compassRef.current) {
            const angle = Math.atan2(camera.position.x, camera.position.z);
            const angleDeg = -(angle * 180) / Math.PI; // Inverted for correct direction pointing
            compassRef.current.style.transform = `translate(-50%, -50%) rotate(${angleDeg}deg)`;
        }
    });
    return null;
}

const DIRS = ['NORTH', 'EAST', 'SOUTH', 'WEST'];

export default function TrafficScene({ onTrafficUpdate, initialCounts, wsSignals, simRunning, signalTime, signalMode, isEmergency, spawnEvent }) {
    const [lightState, setLightState] = useState('ALL_RED'); // Wait for backend signal
    const [laneCounts, setLaneCounts] = useState([0, 0, 0, 0, 0, 0, 0, 0]);
    const compassRef = useRef(null);

    // ── Sync lightState ONLY from the Backend WebSocket (DensityController / TimeBasedController) ──
    // The simulation NEVER runs its own internal timer.
    // The backend's selected mode (TIME or DENSITY) fully drives the signal states.
    useEffect(() => {
        if (!wsSignals) return; // No backend signal yet — keep ALL_RED

        // Backend sends: { NORTH:"GREEN", EAST:"RED", SOUTH:"RED", WEST:"RED" }
        // Map to a single master state string used by processLane.
        let activeState = 'ALL_RED';
        for (const [dir, color] of Object.entries(wsSignals)) {
            if (color === 'GREEN') { activeState = `${dir}_GREEN`; break; }
            if (color === 'AMBER') { activeState = `${dir}_AMBER`; break; }
        }
        setLightState(activeState);
    }, [wsSignals]);

    // Stream 3D Simulation vehicles out to the backend AI Engine!
    useEffect(() => {
        if (!simRunning) return;
        // Post every 500ms so backend density controller always has fresh counts.
        // This is especially important for the late-binding next-turn decision
        // made in the last 5 seconds of each green phase.
        const interval = setInterval(() => {
            // Lane index → signal direction (matches processLane lightState checks):
            // 0,1 → dirZ=+1 → NORTH_GREEN controls them → NORTH density
            // 2,3 → dirZ=-1 → SOUTH_GREEN controls them → SOUTH density
            // 4,5 → dirX=+1 → EAST_GREEN controls them  → EAST density
            // 6,7 → dirX=-1 → WEST_GREEN controls them  → WEST density
            const densityPayload = {
                NORTH: laneCounts[0] + laneCounts[1],
                SOUTH: laneCounts[2] + laneCounts[3],
                WEST: laneCounts[4] + laneCounts[5],
                EAST: laneCounts[6] + laneCounts[7]
            };
            fetch('http://localhost:8000/api/density', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(densityPayload)
            }).catch(() => { });
        }, 500);
        return () => clearInterval(interval);
    }, [simRunning, laneCounts]);

    // Push states up to parent app
    useEffect(() => {
        let currentSignals = wsSignals;

        if (!currentSignals) {
            const [activeDir, activeCol] = lightState.split('_');
            const colorMap = { GREEN: 'GREEN', AMBER: 'AMBER', RED: 'RED' };
            currentSignals = {
                NORTH: activeDir === 'NORTH' ? colorMap[activeCol] || 'RED' : 'RED',
                EAST: activeDir === 'EAST' ? colorMap[activeCol] || 'RED' : 'RED',
                SOUTH: activeDir === 'SOUTH' ? colorMap[activeCol] || 'RED' : 'RED',
                WEST: activeDir === 'WEST' ? colorMap[activeCol] || 'RED' : 'RED'
            };
        }

        if (onTrafficUpdate) {
            onTrafficUpdate({
                lightState: wsSignals ? 'LIVE_STREAM' : lightState,
                rawSignals: currentSignals,
                laneCounts,
                cause: wsSignals ? 'Live Video AI' : 'Backend Default Timer'
            });
        }
    }, [lightState, laneCounts, wsSignals, onTrafficUpdate]);

    const getColor = (dir) => lightState.startsWith(dir) ? (lightState.includes('GREEN') ? '#44ff44' : '#ffff44') : '#ff4444';
    const getStateText = (dir) => lightState.startsWith(dir) ? lightState.split('_')[1] : 'RED';

    return (
        <div style={{ width: '100%', height: '100%', backgroundColor: '#87CEEB', position: 'relative' }}>

            <div style={{ position: 'absolute', top: 64, left: 64, zIndex: 10, width: '80px', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif', fontWeight: 'bold', fontSize: '18px', textShadow: '0px 2px 4px rgba(0,0,0,1)' }}>

                {/* Static Compass Card */}
                <div style={{ position: 'relative', width: '100%', height: '100%' }}>

                    {/* Cardinal Directions */}
                    <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translate(-50%, -50%)', color: '#ff4444', lineHeight: 1 }}>N</div>
                    <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translate(-50%, 50%)', color: '#fff', lineHeight: 1 }}>S</div>
                    <div style={{ position: 'absolute', top: '50%', right: 0, transform: 'translate(50%, -50%)', color: '#fff', lineHeight: 1 }}>E</div>
                    <div style={{ position: 'absolute', top: '50%', left: 0, transform: 'translate(-50%, -50%)', color: '#fff', lineHeight: 1 }}>W</div>

                    {/* Rotating Pointer */}
                    <div ref={compassRef} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 0, height: 0, zIndex: 2 }}>
                        {/* Needle pointing in camera direction */}
                        <div style={{ position: 'absolute', bottom: 0, left: -4, width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderBottom: '20px solid #ffaa00' }}></div>
                    </div>

                    {/* Center Pin */}
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '8px', height: '8px', backgroundColor: '#e6c229', borderRadius: '50%', border: '1px solid #222', zIndex: 3 }}></div>
                </div>
            </div>

            <Canvas shadows camera={{ position: [0, 80, 65], fov: 40 }}>
                <color attach="background" args={['#87CEEB']} />

                <CompassUpdater compassRef={compassRef} />

                <ambientLight intensity={0.75} />
                <directionalLight castShadow position={[40, 70, 30]} intensity={1.1} shadow-mapSize={[2048, 2048]} shadow-camera-left={-120} shadow-camera-right={120} shadow-camera-top={120} shadow-camera-bottom={-120} shadow-bias={-0.0005} />
                <hemisphereLight skyColor="#87CEEB" groundColor="#4a7c59" intensity={0.45} />

                {/* Grass ground */}
                <Plane args={[600, 600]} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow>
                    <meshStandardMaterial color="#4a7c59" roughness={0.98} metalness={0} />
                </Plane>

                <Road />
                <UrbanEnvironment />

                {/* Road-surface signal glow — one strip per direction */}
                {/* NOTE: Backend NORTH/SOUTH refer to vehicle heading (northbound/southbound).
                    The 3D arm labeled NORTH is physically on the north side where SOUTHbound
                    vehicles travel — so we swap NORTH↔SOUTH for the visual display. */}
                {['NORTH', 'SOUTH', 'EAST', 'WEST'].map(dir => {
                    // Map arm direction to the backend signal key that controls it
                    const signalKey = dir === 'NORTH' ? 'SOUTH' : dir === 'SOUTH' ? 'NORTH' : dir;
                    const armState = wsSignals
                        ? (wsSignals[signalKey] || 'RED')
                        : (lightState.startsWith(signalKey) ? (lightState.includes('GREEN') ? 'GREEN' : 'AMBER') : 'RED');
                    return (
                        <RoadSignalGlow
                            key={dir}
                            direction={dir}
                            signalState={armState}
                        />
                    );
                })}

                <VehicleManager lightState={lightState} setLaneCounts={setLaneCounts} simRunning={simRunning} signalMode={signalMode} spawnEvent={spawnEvent} />

                <OrbitControls target={[0, 0, 0]} enableZoom={true} enablePan={true} maxPolarAngle={Math.PI / 2 - 0.05} autoRotate={false} />
            </Canvas>
        </div>
    );
}
