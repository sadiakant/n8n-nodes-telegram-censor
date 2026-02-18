const path = require("path");
const { task, src, dest, parallel } = require("gulp");

task("build:icons", parallel(copyNodeIcons, copyCredentialIcons, copyModels));

function copyNodeIcons() {
	const nodeSource = path.resolve("src", "nodes", "**", "*.{png,svg}");
	const nodeDestination = path.resolve("dist", "src", "nodes");

	return src(nodeSource).pipe(dest(nodeDestination));
}

function copyCredentialIcons() {
	const credSource = path.resolve("src", "credentials", "**", "*.{png,svg}");
	const credDestination = path.resolve("dist", "src", "credentials");

	return src(credSource).pipe(dest(credDestination));
}

function copyModels() {
	const modelSource = path.resolve("src", "models", "**", "*");
	const modelDestination = path.resolve("dist", "src", "models");

	return src(modelSource).pipe(dest(modelDestination));
}
