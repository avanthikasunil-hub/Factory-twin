/**
 * Scene lighting setup with soft shadows
 */
export const SceneLighting = () => {
  return (
    <>
      {/* Ambient light for overall illumination */}
      <ambientLight intensity={0.4} color="#e2e8f0" />
      
      {/* Main directional light with shadows */}
      <directionalLight
        position={[10, 15, 5]}
        intensity={1}
        color="#ffffff"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={50}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
        shadow-bias={-0.0001}
      />
      
      {/* Fill light from the opposite side */}
      <directionalLight
        position={[-5, 8, -5]}
        intensity={0.3}
        color="#93c5fd"
      />
      
      {/* Rim light for depth */}
      <directionalLight
        position={[0, 5, -10]}
        intensity={0.2}
        color="#c4b5fd"
      />
      
      {/* Subtle point light for warmth */}
      <pointLight
        position={[0, 10, 0]}
        intensity={0.3}
        color="#fef3c7"
        distance={30}
        decay={2}
      />
    </>
  );
};
