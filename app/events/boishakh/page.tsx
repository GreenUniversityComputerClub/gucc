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

export default function PohelaBoishakh() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    // Three.js setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);

    // Create animated alpona pattern
    const alponaGeometry = new THREE.TorusKnotGeometry(2, 0.5, 100, 16);
    const alponaMaterial = new THREE.MeshPhongMaterial({ 
      color: 0xff3333,
      emissive: 0x440000,
      specular: 0xffffff,
    });
    const alpona = new THREE.Mesh(alponaGeometry, alponaMaterial);
    scene.add(alpona);

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    const pointLight = new THREE.PointLight(0xffffff, 1);
    pointLight.position.set(5, 5, 5);
    scene.add(pointLight);

    camera.position.z = 5;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    const animate = () => {
      requestAnimationFrame(animate);
      alpona.rotation.x += 0.01;
      alpona.rotation.y += 0.01;
      controls.update();
      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
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
      </div>
    </div>
  );
}
