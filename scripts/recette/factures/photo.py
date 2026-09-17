"""Photo abîmée d'une facture fictive : inclinaison, perspective, lumière, bruit, JPEG.

    python3 photo.py source.png destination.jpg inclinee|terne|ticket
"""
import random
import sys

from PIL import Image, ImageEnhance, ImageFilter, ImageOps

source, destination, style = sys.argv[1], sys.argv[2], sys.argv[3]
random.seed(42)
image = Image.open(source).convert("RGB")
fond = (92, 84, 74)

if style == "inclinee":
    image = ImageOps.expand(image, border=80, fill=fond)
    largeur, hauteur = image.size
    decalage = int(largeur * 0.04)
    coeffs = Image.Transform.QUAD
    image = image.transform(image.size, coeffs, (decalage, 0, 0, hauteur, largeur, hauteur - decalage, largeur - decalage, decalage // 2), fillcolor=fond)
    image = image.rotate(-2.5, expand=True, fillcolor=fond)
    image = ImageEnhance.Brightness(image).enhance(0.9)
    qualite = 72
elif style == "terne":
    image = ImageEnhance.Contrast(image).enhance(0.62)
    image = ImageEnhance.Brightness(image).enhance(1.08)
    image = image.filter(ImageFilter.GaussianBlur(0.8))
    qualite = 60
else:  # ticket
    image = ImageOps.expand(image, border=60, fill=(40, 40, 44))
    image = image.rotate(4, expand=True, fillcolor=(40, 40, 44))
    image = ImageEnhance.Contrast(image).enhance(0.85)
    qualite = 70

# Bruit léger, déterministe.
pixels = image.load()
largeur, hauteur = image.size
for _ in range(largeur * hauteur // 40):
    x, y = random.randrange(largeur), random.randrange(hauteur)
    r, g, b = pixels[x, y]
    d = random.randint(-28, 28)
    pixels[x, y] = (max(0, min(255, r + d)), max(0, min(255, g + d)), max(0, min(255, b + d)))

image.thumbnail((1600, 1600))
image.save(destination, "JPEG", quality=qualite)
