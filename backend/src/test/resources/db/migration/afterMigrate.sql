-- Test classpath ONLY: simulate the separately applied manual Supabase DDL.
CREATE TABLE IF NOT EXISTS review_images (
    review_id bigint NOT NULL REFERENCES reviews(review_id) ON DELETE CASCADE,
    image_url varchar(500) NOT NULL,
    image_position integer NOT NULL,
    cloudinary_public_id varchar(255),
    PRIMARY KEY (review_id, image_position)
);
