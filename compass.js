// =============================================
//  Compass Logic
// =============================================

const ring = document.getElementById('compassRing');
const headingVal = document.getElementById('headingVal');
const headingLabel = document.getElementById('headingLabel');
const permissionBtn = document.getElementById('permissionBtn');

// Detect if we need to request permissions (iOS 13+)
if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    permissionBtn.style.display = 'block';
} else {
    // For non-iOS devices, we can just start listening immediately
    startCompass();
}

function requestCompassPermission() {
    DeviceOrientationEvent.requestPermission()
        .then(permissionState => {
            if (permissionState === 'granted') {
                permissionBtn.style.display = 'none';
                startCompass();
            } else {
                alert("Permission to access device orientation was denied.");
            }
        })
        .catch(console.error);
}

function startCompass() {
    window.addEventListener("deviceorientationabsolute", handleOrientation, true);
    
    // Fallback block if absolute is not supported, attempt standard
    window.addEventListener("deviceorientation", (e) => {
        // If webkitCompassHeading exists (iOS)
        if(e.webkitCompassHeading) {
            updateCompassUI(e.webkitCompassHeading);
        } else if (e.absolute === false) {
             // In some android browsers deviceorientationabsolute isn't triggered,
             // and deviceorientation is relative, making a true compass impossible without GPS math.
             // But we will try to use alpha if needed.
             // updateCompassUI(360 - e.alpha); 
        }
    }, true);
}

function handleOrientation(event) {
    let compassHeading = null;

    if (event.webkitCompassHeading) {
        // Apple devices
        compassHeading = event.webkitCompassHeading;
    } else if (event.absolute && event.alpha !== null) {
         // Android devices absolute orientation
         // `alpha` gives rotation from north (0 to 360), counter-clockwise.
         // We usually want bearing (clockwise), which is 360 - alpha
         compassHeading = 360 - event.alpha;
    }

    if (compassHeading !== null) {
        updateCompassUI(compassHeading);
    }
}

function updateCompassUI(heading) {
    // Ensure heading is between 0 and 360
    heading = heading % 360;
    if (heading < 0) heading += 360;

    // Rotate the ring based on heading
    // The ring rotates opposite to the phone rotation to keep North "up"
    ring.style.transform = `rotate(${-heading}deg)`;

    // Update Text
    headingVal.innerHTML = `${Math.round(heading)}<span>°</span>`;
    headingLabel.textContent = getDirectionString(heading);
}

function getDirectionString(heading) {
    const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const index = Math.round(((heading %= 360) < 0 ? heading + 360 : heading) / 45) % 8;
    
    const directionNames = {
        "N": "NORTH",
        "NE": "NORTHEAST",
        "E": "EAST",
        "SE": "SOUTHEAST",
        "S": "SOUTH",
        "SW": "SOUTHWEST",
        "W": "WEST",
        "NW": "NORTHWEST"
    };

    return directionNames[directions[index]];
}

// Fallback error messaging if sensors aren't providing data within 3 seconds
setTimeout(() => {
    if(headingLabel.textContent === "UNKNOWN" && permissionBtn.style.display === "none") {
        headingLabel.textContent = "SENSOR ERROR";
        headingVal.innerHTML = `--<span>°</span>`;
        // Check if we are over HTTP instead of HTTPS (sensors often require HTTPS)
        if(window.location.protocol === 'http:' || window.location.protocol === 'file:') {
            console.warn("Compass sensors often require HTTPS. Try using localhost or a secure connection.");
        }
    }
}, 3000);
