'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import styles from './BoishakhPage.module.css';

const timelineEvents = [
  {
    year: '1584',
    title: 'Introduction of Bengali Calendar',
    description: 'Mughal Emperor Akbar introduced the Bengali calendar to streamline tax collection timing with harvest season, combining lunar Islamic and solar Hindu calendars.',
  },
  {
    year: '1757-1947',
    title: 'Colonial Period',
    description: 'During British rule, Pohela Boishakh became a symbol of Bengali cultural identity and resistance against colonial influence.',
  },
  {
    year: '1952',
    title: 'Language Movement Connection',
    description: 'After the Bengali Language Movement, Pohela Boishakh celebrations gained new significance as a symbol of Bengali nationalism.',
  },
  {
    year: '1989',
    title: 'Mangal Shobhajatra Begins',
    description: 'Faculty of Fine Arts, Dhaka University initiated the Mangal Shobhajatra, which later became a UNESCO Intangible Cultural Heritage.',
  },
  {
    year: '2016',
    title: 'UNESCO Recognition',
    description: 'The Mangal Shobhajatra on Pohela Boishakh was inscribed on UNESCO\'s Representative List of Intangible Cultural Heritage of Humanity.',
  }
];

const culturalElements = [
  {
    title: 'Haal Khata',
    description: 'The tradition of opening new accounting books in businesses, marking fresh financial beginnings.',
    icon: '📚',
  },
  {
    title: 'Traditional Attire',
    description: 'People wear red and white clothing, symbolizing purity, prosperity, and the spirit of the Bengali New Year.',
    icon: '👗',
  },
  {
    title: 'Baishakhi Meal',
    description: 'Special festive meals featuring traditional Bengali dishes, especially panta bhat (fermented rice) with fried hilsa fish.',
    icon: '🍚',
  },
  {
    title: 'Mangal Shobhajatra',
    description: 'A colorful procession featuring masks, motifs, and traditional art that represents triumph of good over evil.',
    icon: '🎭',
  }
];

// Type definition for the shape data
interface ShapeData {
  mesh: THREE.Mesh;
  rotationSpeed: number;
  rotationAxis: THREE.Vector3;
}

export default function PohelaBoishakh() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    // --- Three.js Setup ---
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, alpha: true, antialias: true });
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
    const animate = () => {
      requestAnimationFrame(animate);

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
      window.removeEventListener('resize', handleResize);
      // Dispose geometries and materials if needed for larger scenes
       scene.remove(shapesGroup);
       redMaterial.dispose();
       whiteMaterial.dispose();
       shapeGeometrySphere.dispose();
       shapeGeometryCone.dispose();
      // Consider disposing renderer context if component unmounts frequently
    };
  }, []);

  return (
    <div className={styles.container}>
      <canvas ref={canvasRef} className={styles.canvas} />

      <div className={styles.content}>
        <h1 className={styles.title}>পহেলা বৈশাখ</h1>
        <h2 className={styles.subtitle}>Bengali New Year Celebration</h2>

        <div className={styles.festivalInfo}>
          <div className={styles.card}>
            <h3>About the Festival</h3>
            <p>
              Pohela Boishakh marks the first day of the Bengali calendar, celebrated on April 14 in Bangladesh
              and April 15 in India. It's a celebration that transcends religious boundaries, bringing together
              people of all faiths in a display of Bengali cultural unity and heritage.
            </p>
          </div>
        </div>

        <div className={styles.culturalElements}>
          <h2>Cultural Elements</h2>
          <div className={styles.elementsGrid}>
            {culturalElements.map((element, index) => (
              <div key={index} className={styles.elementCard}>
                <span className={styles.elementIcon}>{element.icon}</span>
                <h3>{element.title}</h3>
                <p>{element.description}</p>
              </div>
            ))}
          </div>
        </div>

        <section className={styles.timelineSection}>
          <h2 className={styles.timelineTitle}>History of Pohela Boishakh</h2>
          <div className={styles.timeline}>
            {timelineEvents.map((event, index) => (
              <div key={event.year} className={`${styles.timelineItem} ${index % 2 === 0 ? styles.left : styles.right}`}>
                <div className={styles.timelineContent}>
                  <div className={styles.timelineDot} />
                  <span className={styles.timelineYear}>{event.year}</span>
                  <h3 className={styles.timelineEventTitle}>{event.title}</h3>
                  <p className={styles.timelineDescription}>{event.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.celebrations}>
          <h2>Modern Celebrations</h2>
          <div className={styles.celebrationCards}>
            <div className={styles.celebrationCard}>
              <h3>In Bangladesh</h3>
              <p>
                Celebrations begin at dawn with the Mangal Shobhajatra procession at Dhaka University,
                featuring large colorful masks, motifs, and traditional art. The day is marked by
                cultural programs, fairs, and traditional Bengali entertainment.
              </p>
            </div>
            <div className={styles.celebrationCard}>
              <h3>In West Bengal</h3>
              <p>
                Known as Poila Boishakh, the day features cultural events, special prayers, and the
                tradition of Haal Khata where businesses start new accounting books. People wear new
                clothes and exchange greetings.
              </p>
            </div>
            <div className={styles.celebrationCard}>
              <h3>Global Celebrations</h3>
              <p>
                Bengali communities worldwide celebrate with cultural programs, traditional food,
                and music, keeping their cultural heritage alive while adapting to local contexts.
              </p>
            </div>
          </div>
        </section>

        {/* --- GUCC Section Start --- */}
        <section className={styles.guccSection}>
          <h2>GUCC Celebrates Pohela Boishakh</h2>
          <div className={styles.guccCard}>
            <p>
              The Green University Computer Club (GUCC) extends its warmest wishes to everyone on this joyous occasion of Pohela Boishakh! As technology enthusiasts, we cherish the rich tapestry of our Bengali culture and believe in the power of innovation to connect us with our roots. Let this New Year inspire creativity, collaboration, and a celebration of both our heritage and our future.
            </p>
            <p>শুভ নববর্ষ ১৪৩১!</p> {/* Update year if needed */} 
          </div>
        </section>
        {/* --- GUCC Section End --- */}

        {/* --- Tech & Tradition Section Start --- */}
        <section className={styles.techTraditionSection}>
          <h2>Technology Meets Tradition</h2>
          <div className={styles.techCards}>
            <div className={styles.techCard}>
              <span className={styles.techIcon}>🎨</span>
              <h3>Digital Art & Creativity</h3>
              <p>Exploring traditional motifs like Alpona through digital mediums allows for new forms of expression and preservation.</p>
            </div>
            <div className={styles.techCard}>
              <span className={styles.techIcon}>🌐</span>
              <h3>Connecting Communities</h3>
              <p>Technology bridges distances, enabling Bengalis worldwide to share celebrations and cultural experiences online.</p>
            </div>
             <div className={styles.techCard}>
               <span className={styles.techIcon}>💡</span>
               <h3>Digital Alpona Concept</h3>
               <p>Imagine interactive digital Alpona installations or apps allowing users to create and share their own festive patterns. A fusion of code and culture!</p>
             </div>
          </div>
        </section>
        {/* --- Tech & Tradition Section End --- */}

      </div>
    </div>
  );
}
