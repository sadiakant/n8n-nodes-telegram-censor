const path = require("path");
const fs = require("fs");
const { task } = require("gulp");

task("build", function copyModels(done) {
	const sourceDir = path.resolve("models");
	const destDir = path.resolve("dist", "models");

	if (!fs.existsSync(destDir)) {
		fs.mkdirSync(destDir, { recursive: true });
	}

	const onnxFiles = fs
		.readdirSync(sourceDir)
		.filter((f) => f.endsWith(".onnx"));

	for (const file of onnxFiles) {
		const srcPath = path.join(sourceDir, file);
		const dstPath = path.join(destDir, file);
		// fs.copyFileSync does a byte-exact binary copy (no encoding issues)
		fs.copyFileSync(srcPath, dstPath);
	}

	console.log("\n│\n└  Copied Model file");
	done();
});

