/**
 * The Boishakh page's three.js scene. Loaded only in the browser (see
 * canvas.tsx), so three.js stays out of the server Worker bundle.
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

interface ShapeData {
  mesh: THREE.Mesh;
  rotationSpeed: number;
  rotationAxis: THREE.Vector3;
}

export function mountScene(canvas: HTMLCanvasElement): () => void {
    // --- Three.js Setup ---
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    // --- Festive Shapes ---
    const shapesGroup = new THREE.Group();
    const shapeGeometrySphere = new THREE.SphereGeometry(0.5, 32, 16);
    const shapeGeometryCone = new THREE.ConeGeometry(0.5, 1, 32); // Suggests kites or decorative elements

    const redMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.5, metalness: 0.3 });
    const whiteMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.3 });

    const shapes: ShapeData[] = []; // Explicitly type the array
    const shapeCount = 15; // Number of shapes

    for (let i = 0; i < shapeCount; i++) {
      const isSphere = Math.random() > 0.5;
      const geometry = isSphere ? shapeGeometrySphere : shapeGeometryCone;
      const material = Math.random() > 0.4 ? redMaterial : whiteMaterial; // More red than white
      const mesh = new THREE.Mesh(geometry, material);

      // Random positions within a sphere
      const phi = Math.acos(-1 + (2 * i) / shapeCount);
      const theta = Math.sqrt(shapeCount * Math.PI) * phi;

      mesh.position.setFromSphericalCoords(
          3 + Math.random() * 2, // Radius from center
          phi,
          theta
      );

       // Random initial rotation
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

      // Random rotation speed and axis
      const rotationSpeed = 0.005 + Math.random() * 0.01;
      const rotationAxis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();

      shapes.push({ mesh, rotationSpeed, rotationAxis });
      shapesGroup.add(mesh);
    }
    scene.add(shapesGroup);


    // --- Lighting ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); // Brighter ambient
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);

    const pointLight = new THREE.PointLight(0xffccaa, 0.5); // Warmer point light
    pointLight.position.set(-5, -5, -5);
    scene.add(pointLight);

    camera.position.z = 8; // Move camera back slightly

    // --- Controls ---
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enableZoom = false; // Optional: disable zoom for a cleaner look
    controls.minDistance = 5;
    controls.maxDistance = 15;
    controls.autoRotate = true; // Auto-rotate the scene
    controls.autoRotateSpeed = 0.5; // Adjust rotation speed


    // --- Animation Loop ---
    let frameId = 0;
    const animate = () => {
      frameId = requestAnimationFrame(animate);

      // Animate individual shapes
      shapes.forEach(shape => {
         shape.mesh.rotateOnAxis(shape.rotationAxis, shape.rotationSpeed);
      });

      // Rotate the whole group slowly (optional)
      // shapesGroup.rotation.y += 0.001;

      controls.update(); // Required if controls.enableDamping or controls.autoRotate are set
      renderer.render(scene, camera);
    };

    animate();

    // --- Handle Resize ---
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      renderer.setPixelRatio(window.devicePixelRatio);
    };

    window.addEventListener('resize', handleResize);

    // --- Cleanup ---
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', handleResize);
      controls.dispose();
      scene.remove(shapesGroup);
      redMaterial.dispose();
      whiteMaterial.dispose();
      shapeGeometrySphere.dispose();
      shapeGeometryCone.dispose();
      // Frees the WebGL context; browsers cap how many may be live at once.
      renderer.dispose();
    };
}
