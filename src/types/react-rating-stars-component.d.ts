declare module "react-rating-stars-component" {
  import type { FC } from "react";

  const ReactStars: FC<{
    count?: number;
    value?: number;
    size?: number;
    activeColor?: string;
    isHalf?: boolean;
    edit?: boolean;
    onChange?: (newRating: number) => void;
  }>;
  export default ReactStars;
}
