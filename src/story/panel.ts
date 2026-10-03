import stylesheetUrl from "../styles/story.css?url";
import { loadFeatureStylesheet } from "../feature-styles.js";

export const loadStyles = () => loadFeatureStylesheet(stylesheetUrl);
export { mountStoryHub } from "./hub.js";
