import * as THREE from './three.min.js';
import { setupBird } from './bird.js';

export function setupWorld(scene) {
    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);
    
    // Add directional light (sun)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(100, 200, 100);
    directionalLight.castShadow = true;
    
    // Configure shadow properties
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 10;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.camera.left = -100;
    directionalLight.shadow.camera.right = 100;
    directionalLight.shadow.camera.top = 100;
    directionalLight.shadow.camera.bottom = -100;
    
    scene.add(directionalLight);
    
    // Sky dome
    const skyGeometry = new THREE.SphereGeometry(1000, 32, 32);
    const skyMaterial = new THREE.MeshBasicMaterial({
        color: 0x87ceeb,
        side: THREE.BackSide
    });
    const sky = new THREE.Mesh(skyGeometry, skyMaterial);
    scene.add(sky);
    
    // Create clouds
    createClouds(scene, 30);
    
    // Create terrain
    const terrainWidth = 2000;
    const terrainDepth = 2000;
    const terrainGeometry = new THREE.PlaneGeometry(terrainWidth, terrainDepth, 100, 100);
    
    // Apply terrain height variation
    const vertices = terrainGeometry.attributes.position.array;
    for (let i = 0; i < vertices.length; i += 3) {
        if (i % 3 === 1) { // Y-component
            vertices[i] = Math.sin(vertices[i-1] / 20) * Math.cos(vertices[i+1] / 20) * 5;
        }
    }
    
    // Apply ground texture
    const terrainMaterial = new THREE.MeshPhongMaterial({
        color: 0x228B22,
        shininess: 0,
        flatShading: true
    });
    
    const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
    terrain.rotation.x = -Math.PI / 2;
    terrain.receiveShadow = true;
    terrain.position.y = -10;
    scene.add(terrain);
    
    // Add water
    const waterGeometry = new THREE.PlaneGeometry(2000, 2000);
    const waterMaterial = new THREE.MeshPhongMaterial({
        color: 0x1E90FF,
        transparent: true,
        opacity: 0.7,
        shininess: 100
    });
    
    const water = new THREE.Mesh(waterGeometry, waterMaterial);
    water.rotation.x = -Math.PI / 2;
    water.position.y = -15;
    scene.add(water);
    
    // Create mountains in the distance
    createMountains(scene);
    
    // Create forest
    createForest(scene, 100);
    
    // Return the bird
    return setupBird(scene);
}

function createClouds(scene, count) {
    const cloudGroup = new THREE.Group();
    
    for (let i = 0; i < count; i++) {
        const cloudGeometry = new THREE.SphereGeometry(Math.random() * 10 + 15, 8, 8);
        const cloudMaterial = new THREE.MeshPhongMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.8
        });
        
        const cloud = new THREE.Mesh(cloudGeometry, cloudMaterial);
        
        // Random position
        cloud.position.set(
            (Math.random() - 0.5) * 500,
            Math.random() * 100 + 50,
            (Math.random() - 0.5) * 500
        );
        
        // Slightly flatten the sphere to look more like a cloud
        cloud.scale.y = 0.5;
        
        cloudGroup.add(cloud);
    }
    
    scene.add(cloudGroup);
    
    // Store the cloud group for animation
    scene.userData.clouds = cloudGroup;
}

function createMountains(scene) {
    const mountainGroup = new THREE.Group();
    
    // Create several mountains
    for (let i = 0; i < 10; i++) {
        const mountainGeometry = new THREE.ConeGeometry(
            Math.random() * 20 + 30, 
            Math.random() * 40 + 60, 
            4
        );
        
        const mountainMaterial = new THREE.MeshPhongMaterial({
            color: 0x808080,
            flatShading: true
        });
        
        const mountain = new THREE.Mesh(mountainGeometry, mountainMaterial);
        
        // Position along the perimeter
        const angle = Math.PI * 2 * i / 10;
        const radius = 400;
        mountain.position.set(
            Math.cos(angle) * radius,
            mountain.geometry.parameters.height / 2 - 10, // Half height to place base at ground level
            Math.sin(angle) * radius
        );
        
        mountainGroup.add(mountain);
    }
    
    scene.add(mountainGroup);
}

function createForest(scene, count) {
    const forestGroup = new THREE.Group();
    
    for (let i = 0; i < count; i++) {
        // Tree trunk
        const trunkGeometry = new THREE.CylinderGeometry(1, 1, 10, 8);
        const trunkMaterial = new THREE.MeshPhongMaterial({
            color: 0x8B4513
        });
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        
        // Tree top
        const topGeometry = new THREE.ConeGeometry(5, 15, 8);
        const topMaterial = new THREE.MeshPhongMaterial({
            color: 0x006400
        });
        const top = new THREE.Mesh(topGeometry, topMaterial);
        top.position.y = 12.5; // Place on top of trunk
        
        // Create tree group
        const tree = new THREE.Group();
        tree.add(trunk);
        tree.add(top);
        
        // Random position away from the center
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * 200 + 200; // Keep away from center
        
        tree.position.set(
            Math.cos(angle) * radius,
            0,
            Math.sin(angle) * radius
        );
        
        // Random scale
        const scale = Math.random() * 0.5 + 0.7;
        tree.scale.set(scale, scale, scale);
        
        forestGroup.add(tree);
    }
    
    scene.add(forestGroup);
}

export function updateWorld(scene, camera, bird) {
    // Make camera follow the bird
    const cameraOffset = new THREE.Vector3(-5, 3, 0);
    const birdPosition = new THREE.Vector3().copy(bird.position);
    
    // Apply rotation to the offset to make camera follow behind the bird
    cameraOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), bird.rotation.y);
    
    // Update camera position
    camera.position.copy(birdPosition).add(cameraOffset);
    camera.lookAt(bird.position);
    
    // Animate clouds
    if (scene.userData.clouds) {
        scene.userData.clouds.children.forEach(cloud => {
            cloud.position.x -= 0.05; // Move clouds slowly
            if (cloud.position.x < -300) {
                cloud.position.x = 300; // Reset position when out of view
            }
        });
    }
}