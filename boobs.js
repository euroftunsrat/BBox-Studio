(() => {
    "use strict"

    // Parameters
    const saveInterval = 60
    const fontBaseSize = 30
    const fontColor = "#001f3f"
    const borderColor = "#001f3f"
    const backgroundColor = "rgba(0, 116, 217, 0.2)"
    const markedFontColor = "#FF4136"
    const markedBorderColor = "#FF4136"
    const markedBackgroundColor = "rgba(255, 133, 27, 0.2)"
    const minBBoxWidth = 5
    const minBBoxHeight = 5
    const scrollSpeed = 1.1
    const minZoom = 0.1
    const maxZoom = 5
    const edgeSize = 8 // 8-handle resize activation area
    const resetCanvasOnChange = true
    const defaultScale = 0.5
    const drawCenterX = true
    const drawGuidelines = true
    const fittedZoom = true

    let canvas = null
    let images = {}
    let classes = {}
    let bboxes = {}

    // Dataset split percentages (Default: Train 70, Val 20, Test 10 - test can be 0)
    let datasetSplit = {
        train: 70,
        val: 20,
        test: 10
    }

    const extensions = ["jpg", "jpeg", "png", "JPG", "JPEG", "PNG"]

    let currentImage = null
    let currentClass = null
    let currentBbox = null
    let imageListIndex = 0
    let classListIndex = 0

    let scale = defaultScale
    let canvasX = 0
    let canvasY = 0
    let screenX = 0
    let screenY = 0

    const mouse = {
        x: 0,
        y: 0,
        realX: 0,
        realY: 0,
        buttonL: false,
        buttonR: false,
        startRealX: 0,
        startRealY: 0
    }

    document.addEventListener("contextmenu", (e) => { e.preventDefault() }, false)

    const isSupported = () => {
        try {
            const key = "__random_key_boobs__"
            localStorage.setItem(key, key)
            localStorage.removeItem(key)
            return true
        } catch (e) {
            return false
        }
    }

    if (isSupported() === true) {
        setInterval(() => {
            if (Object.keys(bboxes).length > 0) {
                localStorage.setItem("bboxes", JSON.stringify(bboxes))
            }
        }, saveInterval * 1000)
    }

    // Expose adjustPct globally immediately so onclick handlers always find it
    window.adjustPct = (type, delta) => {
        datasetSplit[type] = Math.max(0, Math.min(100, datasetSplit[type] + delta))

        let total = datasetSplit.train + datasetSplit.val + datasetSplit.test
        let warningEl = document.getElementById("pctWarning")
        let btnEl = document.getElementById("setUpDatasetBtn")

        if (total !== 100) {
            if (!warningEl) {
                warningEl = document.createElement("div")
                warningEl.id = "pctWarning"
                warningEl.style.cssText = "font-size: 10px; color: red; margin-top: 3px;"
                const section = document.getElementById("datasetSetupSection")
                if (section) section.appendChild(warningEl)
            }
            if (warningEl) {
                warningEl.style.display = "block"
                warningEl.innerText = `Total saat ini ${total}%. Harus tepat 100%!`
            }
            if (btnEl) btnEl.disabled = true
        } else {
            if (warningEl) warningEl.style.display = "none"
            if (btnEl) btnEl.disabled = false
        }

        const trainEl = document.getElementById("trainPctVal")
        const valEl = document.getElementById("valPctVal")
        const testEl = document.getElementById("testPctVal")
        if (trainEl) trainEl.innerText = datasetSplit.train
        if (valEl) valEl.innerText = datasetSplit.val
        if (testEl) testEl.innerText = datasetSplit.test
    }

    const initApp = () => {
        listenCanvas()
        listenCanvasMouse()
        listenImageLoad()
        listenImageSelect()
        listenClassLoad()
        listenClassSelect()
        listenDirectClassAdd()
        listenBboxLoad()
        listenBboxSave()
        listenBboxVocSave()
        listenBboxCocoSave()
        listenBboxRestore()
        listenKeyboard()
        listenImageSearch()
        listenImageCrop()
        listenVideoConverter()
        listenDatasetSetup()
    }

    // Fitur Tambah Kelas Langsung secara Manual
    const listenDirectClassAdd = () => {
        const addBtn = document.getElementById("addClassBtn")
        const inputField = document.getElementById("newClassNameInput")
        if (!addBtn || !inputField) return

        const handleAdd = () => {
            const className = inputField.value.trim()
            if (!className) {
                alert("Nama kelas tidak boleh kosong!")
                return
            }

            // Cek apakah kelas sudah ada
            if (classes.hasOwnProperty(className)) {
                alert(`Kelas "${className}" sudah ada di dalam list!`)
                return
            }

            // Tentukan index ID YOLO berikutnya (0, 1, 2, dst)
            const newIndex = Object.keys(classes).length
            classes[className] = newIndex

            // Tambahkan ke elemen <select id="classList">
            const classList = document.getElementById("classList")
            const option = document.createElement("option")
            option.value = newIndex
            option.innerHTML = className

            // Jika ini kelas pertama yang ditambahkan, langsung select
            if (Object.keys(classes).length === 1) {
                option.selected = true
                currentClass = className
            }

            classList.appendChild(option)
            inputField.value = "" // Reset input

            // Aktifkan tombol bboxes jika gambar sudah ada
            if (Object.keys(images).length > 0) {
                const bboxesEl = document.getElementById("bboxes")
                const restoreEl = document.getElementById("restoreBboxes")
                if (bboxesEl) bboxesEl.disabled = false
                if (restoreEl) restoreEl.disabled = false
            }

            // Set current class aktif
            setCurrentClass()
        }

        addBtn.addEventListener("click", handleAdd)
        inputField.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault()
                handleAdd()
            }
        })
    }

    if (document.readyState === "complete" || document.readyState === "interactive") {
        initApp()
    } else {
        document.addEventListener("DOMContentLoaded", initApp)
    }

    const listenCanvas = () => {
        const rightEl = document.getElementById("right")
        if (!rightEl) return
        canvas = new Canvas("canvas", rightEl.clientWidth, window.innerHeight - 20)
        canvas.on("draw", (context) => {
            if (currentImage !== null) {
                drawImage(context)
                drawNewBbox(context)
                drawExistingBboxes(context)
                drawCross(context)
            } else {
                drawIntro(context)
            }
        }).start()
    }

    const drawImage = (context) => {
        context.drawImage(currentImage.object, zoomX(0), zoomY(0), zoom(currentImage.width), zoom(currentImage.height))
    }

    const drawIntro = (context) => {
        setFontStyles(context, false)
        context.fillText("ENHANCED BOOBS ANNOTATOR:", zoomX(20), zoomY(40))
        context.fillText("1. Load Images or Convert Video to Frames", zoomX(20), zoomY(80))
        context.fillText("2. Load Classes (.names)", zoomX(20), zoomY(120))
        context.fillText("3. Draw & Full Transform Bboxes (8 Handles)", zoomX(20), zoomY(160))
        context.fillText("4. Manage Output Workspace & Set Up Dataset (Train/Val/Test)", zoomX(20), zoomY(200))
    }

    const drawNewBbox = (context) => {
        if (mouse.buttonL === true && currentClass !== null && currentBbox === null) {
            const width = (mouse.realX - mouse.startRealX)
            const height = (mouse.realY - mouse.startRealY)

            setBBoxStyles(context, true)
            context.strokeRect(zoomX(mouse.startRealX), zoomY(mouse.startRealY), zoom(width), zoom(height))
            context.fillRect(zoomX(mouse.startRealX), zoomY(mouse.startRealY), zoom(width), zoom(height))

            drawX(context, mouse.startRealX, mouse.startRealY, width, height)
            setBboxCoordinates(mouse.startRealX, mouse.startRealY, width, height)
        }
    }

    const drawExistingBboxes = (context) => {
        const currentBboxes = bboxes[currentImage.name]
        for (let className in currentBboxes) {
            currentBboxes[className].forEach(bbox => {
                setFontStyles(context, bbox.marked)
                context.fillText(className, zoomX(bbox.x), zoomY(bbox.y - 2))

                setBBoxStyles(context, bbox.marked)
                context.strokeRect(zoomX(bbox.x), zoomY(bbox.y), zoom(bbox.width), zoom(bbox.height))
                context.fillRect(zoomX(bbox.x), zoomY(bbox.y), zoom(bbox.width), zoom(bbox.height))

                drawX(context, bbox.x, bbox.y, bbox.width, bbox.height)

                if (bbox.marked === true) {
                    setBboxCoordinates(bbox.x, bbox.y, bbox.width, bbox.height)
                    drawResizeHandles(context, bbox)
                }
            })
        }
    }

    // Render 8 Resize Handles (4 corners + 4 edge centers) when BBox is marked
    const drawResizeHandles = (context, bbox) => {
        const handleSize = 6
        const half = handleSize / 2
        const x = bbox.x
        const y = bbox.y
        const w = bbox.width
        const h = bbox.height

        const handles = [
            { rx: x - half, ry: y - half }, // top-left
            { rx: x + w / 2 - half, ry: y - half }, // top
            { rx: x + w - half, ry: y - half }, // top-right
            { rx: x + w - half, ry: y + h / 2 - half }, // right
            { rx: x + w - half, ry: y + h - half }, // bottom-right
            { rx: x + w / 2 - half, ry: y + h - half }, // bottom
            { rx: x - half, ry: y + h - half }, // bottom-left
            { rx: x - half, ry: y + h / 2 - half } // left
        ]

        context.fillStyle = "#FF4136"
        context.strokeStyle = "#FFFFFF"
        context.lineWidth = 1
        handles.forEach(hnd => {
            context.fillRect(zoomX(hnd.rx), zoomY(hnd.ry), zoom(handleSize), zoom(handleSize))
            context.strokeRect(zoomX(hnd.rx), zoomY(hnd.ry), zoom(handleSize), zoom(handleSize))
        })
    }

    const drawX = (context, x, y, width, height) => {
        if (drawCenterX === true) {
            const centerX = x + width / 2
            const centerY = y + height / 2

            context.beginPath()
            context.moveTo(zoomX(centerX), zoomY(centerY - 10))
            context.lineTo(zoomX(centerX), zoomY(centerY + 10))
            context.stroke()

            context.beginPath()
            context.moveTo(zoomX(centerX - 10), zoomY(centerY))
            context.lineTo(zoomX(centerX + 10), zoomY(centerY))
            context.stroke()
        }
    }

    const drawCross = (context) => {
        if (drawGuidelines === true) {
            context.setLineDash([5])
            context.beginPath()
            context.moveTo(zoomX(mouse.realX), zoomY(0))
            context.lineTo(zoomX(mouse.realX), zoomY(currentImage.height))
            context.stroke()

            context.beginPath()
            context.moveTo(zoomX(0), zoomY(mouse.realY))
            context.lineTo(zoomX(currentImage.width), zoomY(mouse.realY))
            context.stroke()
            context.setLineDash([])
        }
    }

    const setBBoxStyles = (context, marked) => {
        context.setLineDash([])
        if (marked === false) {
            context.strokeStyle = borderColor
            context.fillStyle = backgroundColor
        } else {
            context.strokeStyle = markedBorderColor
            context.fillStyle = markedBackgroundColor
        }
    }

    const setBboxCoordinates = (x, y, width, height) => {
        const x2 = x + width
        const y2 = y + height
        const infoEl = document.getElementById("bboxInformation")
        if (infoEl) infoEl.innerHTML = `${width}x${height} (${x}, ${y}) (${x2}, ${y2})`
    }

    const setFontStyles = (context, marked) => {
        if (marked === false) {
            context.fillStyle = fontColor
        } else {
            context.fillStyle = markedFontColor
        }
        context.font = context.font.replace(/\d+px/, `${zoom(fontBaseSize)}px`)
    }

    const listenCanvasMouse = () => {
        canvas.element.addEventListener("wheel", trackWheel, { passive: false })
        canvas.element.addEventListener("mousemove", trackPointer)
        canvas.element.addEventListener("mousedown", trackPointer)
        canvas.element.addEventListener("mouseup", trackPointer)
        canvas.element.addEventListener("mouseout", trackPointer)
    }

    const trackWheel = (event) => {
        if (event.deltaY < 0) {
            scale = Math.min(maxZoom, scale * scrollSpeed)
        } else {
            scale = Math.max(minZoom, scale * (1 / scrollSpeed))
        }
        canvasX = mouse.realX
        canvasY = mouse.realY
        screenX = mouse.x
        screenY = mouse.y

        mouse.realX = zoomXInv(mouse.x)
        mouse.realY = zoomYInv(mouse.y)
        event.preventDefault()
    }

    const trackPointer = (event) => {
        mouse.bounds = canvas.element.getBoundingClientRect()
        mouse.x = event.clientX - mouse.bounds.left
        mouse.y = event.clientY - mouse.bounds.top

        const xx = mouse.realX
        const yy = mouse.realY

        mouse.realX = zoomXInv(mouse.x)
        mouse.realY = zoomYInv(mouse.y)

        if (event.type === "mousedown") {
            mouse.startRealX = mouse.realX
            mouse.startRealY = mouse.realY

            if (event.which === 3) {
                mouse.buttonR = true
            } else if (event.which === 1) {
                mouse.buttonL = true
            }
        } else if (event.type === "mouseup" || event.type === "mouseout") {
            if (mouse.buttonL === true && currentImage !== null && currentClass !== null) {
                const movedWidth = Math.max((mouse.startRealX - mouse.realX), (mouse.realX - mouse.startRealX))
                const movedHeight = Math.max((mouse.startRealY - mouse.realY), (mouse.realY - mouse.startRealY))

                if (currentBbox === null) {
                    if (movedWidth > minBBoxWidth && movedHeight > minBBoxHeight) {
                        storeNewBbox(movedWidth, movedHeight)
                    } else {
                        setBboxMarkedState()
                    }
                } else {
                    updateBboxAfterTransform()
                }
            }
            mouse.buttonR = false
            mouse.buttonL = false
            if (currentBbox) {
                currentBbox.resizing = null
                currentBbox.moving = false
            }
        }

        if (mouse.buttonL && currentBbox) {
            if (currentBbox.resizing) {
                resizeBbox()
            } else if (currentBbox.moving) {
                moveBbox()
            }
        } else {
            checkBboxInteractionStart()
        }

        changeCursorByLocation()
        panImage(xx, yy)
    }

    const checkBboxInteractionStart = () => {
        if (currentBbox === null || currentImage === null) return
        const x = currentBbox.bbox.x
        const y = currentBbox.bbox.y
        const w = currentBbox.bbox.width
        const h = currentBbox.bbox.height

        const handles = {
            "topLeft": { x: x, y: y },
            "top": { x: x + w / 2, y: y },
            "topRight": { x: x + w, y: y },
            "right": { x: x + w, y: y + h / 2 },
            "bottomRight": { x: x + w, y: y + h },
            "bottom": { x: x + w / 2, y: y + h },
            "bottomLeft": { x: x, y: y + h },
            "left": { x: x, y: y + h / 2 }
        }

        for (let hName in handles) {
            let hPos = handles[hName]
            if (Math.abs(mouse.realX - hPos.x) <= edgeSize && Math.abs(mouse.realY - hPos.y) <= edgeSize) {
                currentBbox.resizing = hName
                currentBbox.originalX = x
                currentBbox.originalY = y
                currentBbox.originalWidth = w
                currentBbox.originalHeight = h
                currentBbox.moving = false
                return
            }
        }

        if (mouse.realX > x + edgeSize && mouse.realX < x + w - edgeSize && mouse.realY > y + edgeSize && mouse.realY < y + h - edgeSize) {
            currentBbox.moving = true
            currentBbox.resizing = null
            currentBbox.originalX = x
            currentBbox.originalY = y
        }
    }

    const storeNewBbox = (movedWidth, movedHeight) => {
        const bbox = {
            x: Math.min(mouse.startRealX, mouse.realX),
            y: Math.min(mouse.startRealY, mouse.realY),
            width: movedWidth,
            height: movedHeight,
            marked: true,
            class: currentClass
        }

        if (typeof bboxes[currentImage.name] === "undefined") bboxes[currentImage.name] = {}
        if (typeof bboxes[currentImage.name][currentClass] === "undefined") bboxes[currentImage.name][currentClass] = []

        bboxes[currentImage.name][currentClass].push(bbox)
        currentBbox = {
            bbox: bbox,
            index: bboxes[currentImage.name][currentClass].length - 1,
            originalX: bbox.x,
            originalY: bbox.y,
            originalWidth: bbox.width,
            originalHeight: bbox.height,
            moving: false,
            resizing: null
        }
    }

    const updateBboxAfterTransform = () => {
        if (currentBbox.bbox.width < 0) {
            currentBbox.bbox.width = Math.abs(currentBbox.bbox.width)
            currentBbox.bbox.x -= currentBbox.bbox.width
        }
        if (currentBbox.bbox.height < 0) {
            currentBbox.bbox.height = Math.abs(currentBbox.bbox.height)
            currentBbox.bbox.y -= currentBbox.bbox.height
        }
        currentBbox.bbox.marked = true
        currentBbox.originalX = currentBbox.bbox.x
        currentBbox.originalY = currentBbox.bbox.y
        currentBbox.originalWidth = currentBbox.bbox.width
        currentBbox.originalHeight = currentBbox.bbox.height
        currentBbox.moving = false
        currentBbox.resizing = null
    }

    const setBboxMarkedState = () => {
        const currentBboxes = bboxes[currentImage.name]
        let wasInside = false
        let smallestBbox = Number.MAX_SAFE_INTEGER

        for (let className in currentBboxes) {
            for (let i = 0; i < currentBboxes[className].length; i++) {
                const bbox = currentBboxes[className][i]
                bbox.marked = false
                const endX = bbox.x + bbox.width
                const endY = bbox.y + bbox.height
                const size = bbox.width * bbox.height

                if (mouse.startRealX >= bbox.x && mouse.startRealX <= endX && mouse.startRealY >= bbox.y && mouse.startRealY <= endY) {
                    wasInside = true
                    if (size < smallestBbox) {
                        smallestBbox = size
                        currentBbox = {
                            bbox: bbox,
                            index: i,
                            originalX: bbox.x,
                            originalY: bbox.y,
                            originalWidth: bbox.width,
                            originalHeight: bbox.height,
                            moving: false,
                            resizing: null
                        }
                        bbox.marked = true
                    }
                }
            }
        }
        if (!wasInside) currentBbox = null
    }

    const moveBbox = () => {
        if (currentBbox !== null && currentBbox.moving) {
            currentBbox.bbox.x = currentBbox.originalX + (mouse.realX - mouse.startRealX)
            currentBbox.bbox.y = currentBbox.originalY + (mouse.realY - mouse.startRealY)
        }
    }

    const resizeBbox = () => {
        if (currentBbox === null || currentBbox.resizing === null) return
        const res = currentBbox.resizing
        const origX = currentBbox.originalX
        const origY = currentBbox.originalY
        const origW = currentBbox.originalWidth
        const origH = currentBbox.originalHeight

        let dx = mouse.realX - mouse.startRealX
        let dy = mouse.realY - mouse.startRealY

        if (res === 'left' || res === 'topLeft' || res === 'bottomLeft') {
            currentBbox.bbox.x = origX + dx
            currentBbox.bbox.width = origW - dx
        }
        if (res === 'right' || res === 'topRight' || res === 'bottomRight') {
            currentBbox.bbox.width = origW + dx
        }
        if (res === 'top' || res === 'topLeft' || res === 'topRight') {
            currentBbox.bbox.y = origY + dy
            currentBbox.bbox.height = origH - dy
        }
        if (res === 'bottom' || res === 'bottomLeft' || res === 'bottomRight') {
            currentBbox.bbox.height = origH + dy
        }
    }

    const changeCursorByLocation = () => {
        if (currentImage === null) return
        if (currentBbox !== null) {
            const x = currentBbox.bbox.x
            const y = currentBbox.bbox.y
            const w = currentBbox.bbox.width
            const h = currentBbox.bbox.height

            if (Math.abs(mouse.realX - x) <= edgeSize && Math.abs(mouse.realY - y) <= edgeSize) {
                document.body.style.cursor = "nwse-resize";
                return
            }
            if (Math.abs(mouse.realX - (x + w)) <= edgeSize && Math.abs(mouse.realY - (y + h)) <= edgeSize) {
                document.body.style.cursor = "nwse-resize";
                return
            }
            if (Math.abs(mouse.realX - x) <= edgeSize && Math.abs(mouse.realY - (y + h)) <= edgeSize) {
                document.body.style.cursor = "nesw-resize";
                return
            }
            if (Math.abs(mouse.realX - (x + w)) <= edgeSize && Math.abs(mouse.realY - y) <= edgeSize) {
                document.body.style.cursor = "nesw-resize";
                return
            }
            if (Math.abs(mouse.realY - y) <= edgeSize && mouse.realX > x && mouse.realX < x + w) {
                document.body.style.cursor = "ns-resize";
                return
            }
            if (Math.abs(mouse.realY - (y + h)) <= edgeSize && mouse.realX > x && mouse.realX < x + w) {
                document.body.style.cursor = "ns-resize";
                return
            }
            if (Math.abs(mouse.realX - x) <= edgeSize && mouse.realY > y && mouse.realY < y + h) {
                document.body.style.cursor = "ew-resize";
                return
            }
            if (Math.abs(mouse.realX - (x + w)) <= edgeSize && mouse.realY > y && mouse.realY < y + h) {
                document.body.style.cursor = "ew-resize";
                return
            }

            if (mouse.realX > x + edgeSize && mouse.realX < x + w - edgeSize && mouse.realY > y + edgeSize && mouse.realY < y + h - edgeSize) {
                document.body.style.cursor = "move";
                return
            }
        }
        document.body.style.cursor = "default"
    }

    const panImage = (xx, yy) => {
        if (mouse.buttonR === true) {
            canvasX -= mouse.realX - xx
            canvasY -= mouse.realY - yy
            mouse.realX = zoomXInv(mouse.x)
            mouse.realY = zoomYInv(mouse.y)
        }
    }

    const zoom = (n) => Math.floor(n * scale)
    const zoomX = (n) => Math.floor((n - canvasX) * scale + screenX)
    const zoomY = (n) => Math.floor((n - canvasY) * scale + screenY)
    const zoomXInv = (n) => Math.floor((n - screenX) * (1 / scale) + canvasX)
    const zoomYInv = (n) => Math.floor((n - screenY) * (1 / scale) + canvasY)

    const listenImageLoad = () => {
        document.getElementById("images").addEventListener("change", (event) => {
            const imageList = document.getElementById("imageList")
            const files = event.target.files
            if (files.length > 0) {
                resetImageList()
                document.body.style.cursor = "wait"
                for (let i = 0; i < files.length; i++) {
                    const nameParts = files[i].name.split(".")
                    if (extensions.indexOf(nameParts[nameParts.length - 1]) !== -1) {
                        images[files[i].name] = { meta: files[i], index: i }
                        const option = document.createElement("option")
                        option.value = files[i].name
                        option.innerHTML = files[i].name
                        if (i === 0) option.selected = true
                        imageList.appendChild(option)
                    }
                }
                const imageArray = Object.keys(images)
                let async = imageArray.length
                for (let image in images) {
                    const reader = new FileReader()
                    reader.addEventListener("load", () => {
                        const imageObject = new Image()
                        imageObject.addEventListener("load", (event) => {
                            images[image].width = event.target.width
                            images[image].height = event.target.height
                            if (--async === 0) {
                                document.body.style.cursor = "default"
                                setCurrentImage(images[imageArray[0]])
                                if (Object.keys(classes).length > 0) {
                                    document.getElementById("bboxes").disabled = false
                                    document.getElementById("restoreBboxes").disabled = false
                                }
                            }
                        })
                        imageObject.src = reader.result
                    })
                    reader.readAsDataURL(images[image].meta)
                }
            }
        })
    }

    const resetImageList = () => {
        document.getElementById("imageList").innerHTML = ""
        images = {}
        bboxes = {}
        currentImage = null
    }

    const setCurrentImage = (image) => {
        if (resetCanvasOnChange === true) resetCanvasPlacement()
        if (fittedZoom === true) fitZoom(image)

        const reader = new FileReader()
        reader.addEventListener("load", () => {
            const imageObject = new Image()
            imageObject.addEventListener("load", () => {
                currentImage = {
                    name: image.meta.name,
                    object: imageObject,
                    width: image.width,
                    height: image.height
                }
            })
            imageObject.src = reader.result
            document.getElementById("imageInformation").innerHTML = `${image.width}x${image.height}, ${formatBytes(image.meta.size)}`
        })
        reader.readAsDataURL(image.meta)
        if (currentBbox !== null) {
            currentBbox.bbox.marked = false
            currentBbox = null
        }
    }

    const fitZoom = (image) => {
        if (image.width > image.height) scale = canvas.width / image.width
        else scale = canvas.height / image.height
    }

    const formatBytes = (bytes, decimals) => {
        if (bytes === 0) return "0 Bytes"
        const k = 1024,
            dm = decimals || 2,
            sizes = ["Bytes", "KB", "MB"]
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i]
    }

    const listenImageSelect = () => {
        const imageList = document.getElementById("imageList")
        imageList.addEventListener("change", () => {
            imageListIndex = imageList.selectedIndex
            setCurrentImage(images[imageList.options[imageListIndex].innerHTML])
        })
    }

    const listenClassLoad = () => {
        const classesElement = document.getElementById("classes")
        classesElement.addEventListener("click", () => { classesElement.value = null })
        classesElement.addEventListener("change", (event) => {
            const files = event.target.files
            if (files.length > 0) {
                resetClassList()
                const nameParts = files[0].name.split(".")
                if (nameParts[nameParts.length - 1] === "txt") {
                    const reader = new FileReader()
                    reader.addEventListener("load", () => {
                        const rows = reader.result.split(/[\r\n]+/)
                        const classList = document.getElementById("classList")
                        for (let i = 0; i < rows.length; i++) {
                            rows[i] = rows[i].trim()
                            if (rows[i] !== "") {
                                classes[rows[i]] = i
                                const option = document.createElement("option")
                                option.value = i
                                option.innerHTML = rows[i]
                                if (i === 0) {
                                    option.selected = true;
                                    currentClass = rows[i]
                                }
                                classList.appendChild(option)
                            }
                        }
                        setCurrentClass()
                        if (Object.keys(images).length > 0) {
                            document.getElementById("bboxes").disabled = false
                            document.getElementById("restoreBboxes").disabled = false
                        }
                    })
                    reader.readAsText(files[0])
                }
            }
        })
    }

    const resetClassList = () => {
        document.getElementById("classList").innerHTML = ""
        classes = {}
        currentClass = null
    }

    const setCurrentClass = () => {
        const classList = document.getElementById("classList")
        currentClass = classList.options[classList.selectedIndex].text
        if (currentBbox !== null) {
            currentBbox.bbox.marked = false
            currentBbox = null
        }
    }

    const listenClassSelect = () => {
        const classList = document.getElementById("classList")
        classList.addEventListener("change", () => {
            classListIndex = classList.selectedIndex
            setCurrentClass()
        })
    }

    const listenBboxLoad = () => {
        const bboxesElement = document.getElementById("bboxes")
        bboxesElement.addEventListener("click", () => { bboxesElement.value = null })
        bboxesElement.addEventListener("change", (event) => {
            const files = event.target.files
            if (files.length > 0) {
                bboxes = {}
                for (let i = 0; i < files.length; i++) {
                    const reader = new FileReader()
                    const extension = files[i].name.split(".").pop()
                    reader.addEventListener("load", () => {
                        if (extension === "txt" || extension === "xml" || extension === "json") {
                            storeBbox(files[i].name, reader.result)
                        } else {
                            const zip = new JSZip()
                            zip.loadAsync(reader.result).then((result) => {
                                for (let filename in result.files) {
                                    result.file(filename).async("string").then((text) => {
                                        storeBbox(filename, text)
                                    })
                                }
                            })
                        }
                    })
                    if (extension === "txt" || extension === "xml" || extension === "json") reader.readAsText(files[i])
                    else reader.readAsArrayBuffer(files[i])
                }
            }
        })
    }

    const storeBbox = (filename, text) => {
        let image = null,
            bbox = null
        const extension = filename.split(".").pop()
        if (extension === "txt" || extension === "xml") {
            for (let i = 0; i < extensions.length; i++) {
                const imageName = filename.replace(`.${extension}`, `.${extensions[i]}`)
                if (typeof images[imageName] !== "undefined") {
                    image = images[imageName]
                    if (typeof bboxes[imageName] === "undefined") bboxes[imageName] = {}
                    bbox = bboxes[imageName]
                    if (extension === "txt") {
                        const rows = text.split(/[\r\n]+/)
                        for (let r = 0; r < rows.length; r++) {
                            const cols = rows[r].split(" ")
                            if (cols.length < 5) continue
                            cols[0] = parseInt(cols[0])
                            for (let className in classes) {
                                if (classes[className] === cols[0]) {
                                    if (typeof bbox[className] === "undefined") bbox[className] = []
                                    const width = parseFloat(cols[3]) * image.width
                                    const x = parseFloat(cols[1]) * image.width - width * 0.5
                                    const height = parseFloat(cols[4]) * image.height
                                    const y = parseFloat(cols[2]) * image.height - height * 0.5
                                    bbox[className].push({
                                        x: Math.floor(x),
                                        y: Math.floor(y),
                                        width: Math.floor(width),
                                        height: Math.floor(height),
                                        marked: false,
                                        class: className
                                    })
                                    break
                                }
                            }
                        }
                    } else if (extension === "xml") {
                        const parser = new DOMParser()
                        const xmlDoc = parser.parseFromString(text, "text/xml")
                        const objects = xmlDoc.getElementsByTagName("object")
                        for (let j = 0; j < objects.length; j++) {
                            const objectName = objects[j].getElementsByTagName("name")[0].childNodes[0].nodeValue
                            for (let className in classes) {
                                if (className === objectName) {
                                    if (typeof bbox[className] === "undefined") bbox[className] = []
                                    const bndBox = objects[j].getElementsByTagName("bndbox")[0]
                                    const bndBoxX = bndBox.getElementsByTagName("xmin")[0].childNodes[0].nodeValue
                                    const bndBoxY = bndBox.getElementsByTagName("ymin")[0].childNodes[0].nodeValue
                                    const bndBoxMaxX = bndBox.getElementsByTagName("xmax")[0].childNodes[0].nodeValue
                                    const bndBoxMaxY = bndBox.getElementsByTagName("ymax")[0].childNodes[0].nodeValue
                                    bbox[className].push({
                                        x: parseInt(bndBoxX),
                                        y: parseInt(bndBoxY),
                                        width: parseInt(bndBoxMaxX) - parseInt(bndBoxX),
                                        height: parseInt(bndBoxMaxY) - parseInt(bndBoxY),
                                        marked: false,
                                        class: className
                                    })
                                    break
                                }
                            }
                        }
                    }
                }
            }
        } else if (extension === "json") {
            const json = JSON.parse(text)
            for (let i = 0; i < json.annotations.length; i++) {
                let imageName = null,
                    categoryName = null
                for (let j = 0; j < json.images.length; j++) {
                    if (json.annotations[i].image_id === json.images[j].id) {
                        imageName = json.images[j].file_name
                        if (typeof images[imageName] !== "undefined") {
                            image = images[imageName]
                            if (typeof bboxes[imageName] === "undefined") bboxes[imageName] = {}
                            bbox = bboxes[imageName]
                            break
                        }
                    }
                }
                for (let j = 0; j < json.categories.length; j++) {
                    if (json.annotations[i].category_id === json.categories[j].id) {
                        categoryName = json.categories[j].name
                        break
                    }
                }
                for (let className in classes) {
                    if (className === categoryName && bbox !== null) {
                        if (typeof bbox[className] === "undefined") bbox[className] = []
                        const [bboxX, bboxY, bboxWidth, bboxHeight] = json.annotations[i].bbox
                        bbox[className].push({
                            x: bboxX,
                            y: bboxY,
                            width: bboxWidth,
                            height: bboxHeight,
                            marked: false,
                            class: className
                        })
                        break
                    }
                }
            }
        }
    }

    const listenBboxSave = () => {
        document.getElementById("saveBboxes").addEventListener("click", () => {
            const zip = new JSZip()
            for (let imageName in bboxes) {
                const image = images[imageName]
                const name = imageName.split(".")
                name[name.length - 1] = "txt"
                const result = []
                for (let className in bboxes[imageName]) {
                    for (let i = 0; i < bboxes[imageName][className].length; i++) {
                        const bbox = bboxes[imageName][className][i]
                        const x = (bbox.x + bbox.width / 2) / image.width
                        const y = (bbox.y + bbox.height / 2) / image.height
                        const width = bbox.width / image.width
                        const height = bbox.height / image.height
                        result.push(`${classes[className]} ${x} ${y} ${width} ${height}`)
                    }
                }
                zip.file(name.join("."), result.join("\n"))
            }
            zip.generateAsync({ type: "blob" }).then((blob) => { saveAs(blob, "bboxes_yolo.zip") })
        })
    }

    const listenBboxVocSave = () => {
        document.getElementById("saveVocBboxes").addEventListener("click", () => {
            const folderPath = document.getElementById("vocFolder").value
            const zip = new JSZip()
            for (let imageName in bboxes) {
                const image = images[imageName]
                const name = imageName.split(".")
                name[name.length - 1] = "xml"
                const result = ["<?xml version=\"1.0\"?>", "<annotation>", `<folder>${folderPath}</folder>`, `<filename>${imageName}</filename>`]
                for (let className in bboxes[imageName]) {
                    for (let i = 0; i < bboxes[imageName][className].length; i++) {
                        const bbox = bboxes[imageName][className][i]
                        result.push("<object>", `<name>${className}</name>`, "<bndbox>", `<xmin>${bbox.x}</xmin>`, `<ymin>${bbox.y}</ymin>`, `<xmax>${bbox.x + bbox.width}</xmax>`, `<ymax>${bbox.y + bbox.height}</ymax>`, "</bndbox>", "</object>")
                    }
                }
                result.push("</annotation>")
                zip.file(name.join("."), result.join("\n"))
            }
            zip.generateAsync({ type: "blob" }).then((blob) => { saveAs(blob, "bboxes_voc.zip") })
        })
    }

    const listenBboxCocoSave = () => {
        document.getElementById("saveCocoBboxes").addEventListener("click", () => {
            const zip = new JSZip()
            const result = { images: [], type: "instances", annotations: [], categories: [] }
            for (let className in classes) {
                result.categories.push({ supercategory: "none", id: classes[className] + 1, name: className })
            }
            for (let imageName in images) {
                result.images.push({ id: images[imageName].index + 1, file_name: imageName, width: images[imageName].width, height: images[imageName].height })
            }
            let id = 0
            for (let imageName in bboxes) {
                const image = images[imageName]
                for (let className in bboxes[imageName]) {
                    for (let i = 0; i < bboxes[imageName][className].length; i++) {
                        const bbox = bboxes[imageName][className][i]
                        result.annotations.push({
                            area: bbox.width * bbox.height,
                            iscrowd: 0,
                            ignore: 0,
                            image_id: image.index + 1,
                            bbox: [bbox.x, bbox.y, bbox.width, bbox.height],
                            category_id: classes[className] + 1,
                            id: ++id
                        })
                    }
                }
            }
            zip.file("coco.json", JSON.stringify(result))
            zip.generateAsync({ type: "blob" }).then((blob) => { saveAs(blob, "bboxes_coco.zip") })
        })
    }

    const listenBboxRestore = () => {
        document.getElementById("restoreBboxes").addEventListener("click", () => {
            const item = localStorage.getItem("bboxes")
            if (item) bboxes = JSON.parse(item)
        })
    }

    const listenKeyboard = () => {
        const imageList = document.getElementById("imageList")
        const classList = document.getElementById("classList")
        document.addEventListener("keydown", (event) => {
            const key = event.keyCode || event.charCode
            if (key === 46 || (key === 8 && event.metaKey === true)) {
                if (currentBbox !== null) {
                    bboxes[currentImage.name][currentBbox.bbox.class].splice(currentBbox.index, 1)
                    currentBbox = null
                    document.body.style.cursor = "default"
                }
                event.preventDefault()
            }
            if (key === 37) { // Left Arrow
                if (imageList.length > 1) {
                    imageList.options[imageListIndex].selected = false
                    imageListIndex = (imageListIndex === 0) ? imageList.length - 1 : imageListIndex - 1
                    imageList.options[imageListIndex].selected = true
                    imageList.selectedIndex = imageListIndex
                    setCurrentImage(images[imageList.options[imageListIndex].innerHTML])
                }
                event.preventDefault()
            }
            if (key === 39) { // Right Arrow
                if (imageList.length > 1) {
                    imageList.options[imageListIndex].selected = false
                    imageListIndex = (imageListIndex === imageList.length - 1) ? 0 : imageListIndex + 1
                    imageList.options[imageListIndex].selected = true
                    imageList.selectedIndex = imageListIndex
                    setCurrentImage(images[imageList.options[imageListIndex].innerHTML])
                }
                event.preventDefault()
            }
            if (key === 38) { // Up Arrow
                if (classList.length > 1) {
                    classList.options[classListIndex].selected = false
                    classListIndex = (classListIndex === 0) ? classList.length - 1 : classListIndex - 1
                    classList.options[classListIndex].selected = true
                    classList.selectedIndex = classListIndex
                    setCurrentClass()
                }
                event.preventDefault()
            }
            if (key === 40) { // Down Arrow
                if (classList.length > 1) {
                    classList.options[classListIndex].selected = false
                    classListIndex = (classListIndex === classList.length - 1) ? 0 : classListIndex + 1
                    classList.options[classListIndex].selected = true
                    classList.selectedIndex = classListIndex
                    setCurrentClass()
                }
                event.preventDefault()
            }
        })
    }

    const resetCanvasPlacement = () => {
        scale = defaultScale
        canvasX = 0;
        canvasY = 0;
        screenX = 0;
        screenY = 0
        mouse.x = 0;
        mouse.y = 0;
        mouse.realX = 0;
        mouse.realY = 0
        mouse.buttonL = 0;
        mouse.buttonR = 0
    }

    const listenImageSearch = () => {
        document.getElementById("imageSearch").addEventListener("input", (event) => {
            const value = event.target.value
            for (let imageName in images) {
                if (imageName.indexOf(value) !== -1) {
                    document.getElementById("imageList").selectedIndex = images[imageName].index
                    setCurrentImage(images[imageName])
                    break
                }
            }
        })
    }

    const listenImageCrop = () => {
        document.getElementById("cropImages").addEventListener("click", () => {
            const zip = new JSZip()
            let x = 0
            for (let imageName in bboxes) {
                const image = images[imageName]
                for (let className in bboxes[imageName]) {
                    for (let i = 0; i < bboxes[imageName][className].length; i++) {
                        x++
                        const bbox = bboxes[imageName][className][i]
                        const reader = new FileReader()
                        reader.addEventListener("load", () => {
                            const imageObject = new Image()
                            imageObject.addEventListener("load", () => {
                                const temporaryCanvas = document.createElement("canvas")
                                temporaryCanvas.width = bbox.width
                                temporaryCanvas.height = bbox.height
                                temporaryCanvas.getContext("2d").drawImage(imageObject, bbox.x, bbox.y, bbox.width, bbox.height, 0, 0, bbox.width, bbox.height)
                                temporaryCanvas.toBlob((blob) => {
                                    zip.file(`crop_${x}.jpg`, blob)
                                    zip.generateAsync({ type: "blob" }).then((blob) => { saveAs(blob, "crops.zip") })
                                }, image.meta.type)
                            })
                            imageObject.src = reader.result
                        })
                        reader.readAsDataURL(image.meta)
                    }
                }
            }
        })
    }

    // Video to Frames conversion feature
    const listenVideoConverter = () => {
        const btn = document.getElementById("convertVideoBtn")
        if (!btn) return
        btn.addEventListener("click", async() => {
            const fileInput = document.getElementById("videoFile")
            if (!fileInput || fileInput.files.length === 0) {
                alert("Silakan pilih file video terlebih dahulu.")
                return
            }
            const videoFile = fileInput.files[0]
            const projectName = document.getElementById("videoProjectName").value || "project"
            const fps = parseInt(document.getElementById("videoFps").value) || 5
            const progressBar = document.getElementById("extractProgress")
            if (progressBar) {
                progressBar.style.display = "block"
                progressBar.value = 0
            }

            const video = document.createElement("video")
            video.src = URL.createObjectURL(videoFile)
            video.muted = true
            video.playsInline = true

            await new Promise((resolve) => {
                video.onloadedmetadata = () => resolve()
            })

            const duration = video.duration
            const interval = 1 / fps
            const zip = new JSZip()
            let currentTime = 0
            let frameCount = 0

            const canvasTemp = document.createElement("canvas")
            canvasTemp.width = video.videoWidth
            canvasTemp.height = video.videoHeight
            const ctx = canvasTemp.getContext("2d")

            const totalFrames = Math.max(1, Math.floor(duration * fps))

            while (currentTime <= duration) {
                video.currentTime = currentTime
                await new Promise((res) => {
                    video.onseeked = () => res()
                })

                ctx.drawImage(video, 0, 0, canvasTemp.width, canvasTemp.height)
                const blob = await new Promise((res) => canvasTemp.toBlob(res, "image/jpeg", 0.95))

                frameCount++
                const paddedName = String(frameCount).padStart(5, '0')
                zip.file(`frame_${paddedName}.jpg`, blob)

                if (progressBar) {
                    progressBar.value = Math.min(100, (frameCount / totalFrames) * 100)
                }
                currentTime += interval
            }

            zip.generateAsync({ type: "blob" }).then((blob) => {
                saveAs(blob, `inputFrames_${projectName}.zip`)
                if (progressBar) progressBar.style.display = "none"
                alert(`Berhasil mengekstrak ${frameCount} frame! Diunduh sebagai inputFrames_${projectName}.zip`)
            })
        })
    }

    // Manage Output Workspace & Set Up Dataset (Train/Val/Test + classes.txt)
    const listenDatasetSetup = () => {
        const btn = document.getElementById("setUpDatasetBtn")
        if (!btn) return
        btn.addEventListener("click", () => {
            let totalPct = datasetSplit.train + datasetSplit.val + datasetSplit.test
            if (totalPct !== 100) {
                alert(`Total persentase Train, Val, dan Test saat ini ${totalPct}%. Harus tepat 100%!`)
                return
            }

            const imageKeys = Object.keys(images).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
            if (imageKeys.length === 0) {
                alert("Tidak ada gambar yang dimuat di workspace.")
                return
            }

            const classKeys = Object.keys(classes)
            if (classKeys.length === 0) {
                alert("Belum ada kelas yang dibuat atau dimuat.")
                return
            }

            const total = imageKeys.length
            const trainCount = Math.round((datasetSplit.train / 100) * total)
            const valCount = Math.round((datasetSplit.val / 100) * total)

            const trainFiles = imageKeys.slice(0, trainCount)
            const valFiles = imageKeys.slice(trainCount, trainCount + valCount)
            const testFiles = imageKeys.slice(trainCount + valCount)

            const datasetName = document.getElementById("videoProjectName").value || "CustomDataset"
            const zip = new JSZip()
            const root = `Dataset_${datasetName}`

            // 1. Otomatis buat file classes.txt di root folder dataset
            // Isinya hanya nama-nama kelas berurutan baris demi baris tanpa nomor/index
            const classesTxtContent = classKeys.join("\n")
            zip.file(`${root}/classes.txt`, classesTxtContent)

            // 2. Fungsi helper untuk memproses pemisahan Train, Val, dan Test
            const processSplit = (splitName, fileList) => {
                if (fileList.length === 0) return // Skip jika persentase 0% (misal Test = 0%)
                fileList.forEach(fileName => {
                    const baseName = fileName.substring(0, fileName.lastIndexOf('.')) || fileName
                    const imgMeta = images[fileName].meta

                    // Masukkan gambar ke folder split/images/
                    zip.file(`${root}/${splitName}/images/${fileName}`, imgMeta)

                    // Masukkan label YOLO (.txt) ke folder split/frame/ (atau labels)
                    let yoloContent = ""
                    if (bboxes[fileName]) {
                        const imgObj = images[fileName]
                        const lines = []
                        for (let cls in bboxes[fileName]) {
                            bboxes[fileName][cls].forEach(bbox => {
                                const x = (bbox.x + bbox.width / 2) / imgObj.width
                                const y = (bbox.y + bbox.height / 2) / imgObj.height
                                const w = bbox.width / imgObj.width
                                const h = bbox.height / imgObj.height
                                lines.push(`${classes[cls]} ${x} ${y} ${w} ${h}`)
                            })
                        }
                        yoloContent = lines.join("\n")
                    }
                    zip.file(`${root}/${splitName}/frame/${baseName}.txt`, yoloContent)
                })
            }

            processSplit("Train", trainFiles)
            processSplit("Val", valFiles)
            processSplit("Test", testFiles)

            // 3. Generate dan download file zip final
            zip.generateAsync({ type: "blob" }).then((blob) => {
                saveAs(blob, `${root}.zip`)
                alert(`Dataset berhasil disiapkan dengan classes.txt dan diunduh sebagai ${root}.zip!\n- Train: ${trainFiles.length} file\n- Val: ${valFiles.length} file\n- Test: ${testFiles.length} file\n- Classes: ${classKeys.join(", ")}`)
            })
        })
    }

})()