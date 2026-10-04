# Thử nghiệm A/B: prompt v1 (Canon) vs v2 (theo skill Seedance 2.0 Skill OS)

Nguồn skill: <https://github.com/Emily2040/seedance-2.0> (MIT, v6.7.0, đọc ngày 2026-10-01).
Skill chỉ **viết prompt**, không tạo video. Skill viết cho Seedance **2.0**; Dola chạy **2.5** — nguyên tắc
đạo diễn vẫn dùng được, còn các con số (thời lượng, số ảnh tham chiếu…) skill tự cảnh báo là không áp
cho bản khác. Vì vậy cần thử thật trên Dola, không suy luận.

## Cách thử

- Tập 7 và Tập 4: mỗi tập tạo **v1** (trong `tuan-01-prompts.md`) và **v2** (dưới đây), **mỗi bản 2 lần**.
- Chấm 4 clip/tập bằng bảng kiểm Canon §8 + 3 câu: kẹp tóc đúng Bộ 5? dũa/bàn chân đúng Master? câu chốt
  đọc được không?
- Bản nào thắng ở cả 2 tập → đưa quy tắc của bản đó vào Canon.

## 7 quy tắc lấy từ skill (và lỗi trong clip cũ mà nó nhắm vào)

| # | Quy tắc của skill | Lỗi đã thấy trong clip của MỀU |
|---|---|---|
| 1 | Mỗi ảnh tham chiếu **chỉ giữ 1 vai trò** và ghi rõ **bỏ qua** gì: `[Ảnh] controls X only; ignore Y` | Kẹp tóc thành chùm hoa (bảng pose truyền nhầm phụ kiện); dũa kiểu cũ |
| 2 | **Không viết tai nạn làm kết quả** (trượt, đổ, lem) — model sẽ diễn như hành động cố ý. Viết hành động chủ động, hoặc chỉ cho thấy hậu quả | Tập 7 "dũa văng ra" và Tập 4 "làm lem sơn" ở bản v1 |
| 3 | **Không ghi giây tuyệt đối** trong prompt; chia thành Shot 1, Shot 2…, viết "cut to" bằng chữ | v1 ghi 0–2s, 2–5s… |
| 4 | **Mỗi shot 1 hành động chính** | v1 nhồi 3–4 hành động vào 3 giây |
| 5 | Phản ứng = **1 từ cảm xúc + 1 chi tiết cơ thể**, không dùng thành ngữ | — |
| 6 | **Dòng khóa lặp lại ở mọi shot**: ánh sáng, nhận dạng, vị trí, phía máy quay | Mắt đổi màu, chim lúc ngoài lúc trong kính (clip 5) |
| 7 | Prompt **ngắn, khoảng 40–110 từ**; ghi "no subtitles" để AI không tự chèn chữ | Clip 4 bị AI tự chèn chữ vào hình |

## Ảnh tham chiếu (cắt rời, đặt đúng thứ tự)

> Cú pháp gọi ảnh (`[Ảnh 1]`, `@Image1`, `@图片1`…) **tùy từng app**. Dùng đúng ký hiệu Dola hiển thị khi
> gắn ảnh, thay cho `[Ảnh 1]` bên dưới, giữ nguyên chính xác.

| Ảnh | File | Giữ | Bỏ qua |
|---|---|---|---|
| [Ảnh 1] | Proportion Master — dáng khoanh tay | nhận dạng, tỷ lệ thân, hoa văn tam thể, tạp dề, vòng đuôi | dáng đứng, nền |
| [Ảnh 2] | Bộ 5 — chỉ cắt riêng kẹp tóc | kẹp tóc | mọi thứ khác |
| [Ảnh 3] (Tập 7) | Bộ 7 — chỉ cắt riêng cây dũa | hình dáng + màu dũa | chữ trên dũa |
| [Ảnh 3] (Tập 4) | Bộ 4 — chỉ cắt riêng bàn chân | đệm hồng + bớt sakura trắng | mọi thứ khác |

**Không gắn bảng 7 pose.**

---

## Tập 7 — "Dũa theo beat" (v2)

```
[Ảnh 1] controls MỀU's identity, slim long-legged proportions, calico pattern, black apron
and tail ring only; ignore its pose and background. [Ảnh 2] controls her hair clip only.
[Ảnh 3] controls the nail file's shape and colors only; ignore any text on it.

Shot 1: medium shot, static camera in front of a pink-and-white nail table. MỀU files the
nails of her raised paw in rhythm with the music, proud and focused, chin lifted.
Shot 2: cut to a closer medium shot. Pleased with herself, she flicks the file over her
shoulder out of frame; a crash sounds off-screen. She keeps her pose and slowly gives the
camera a smug side-eye.
Both shots: soft pink front light; MỀU with exactly one tail, pink MEU hair clip on her
left ear, standing behind the table, facing the camera.
Sound: upbeat beat, filing scrapes on the beat, off-screen crash, one final beat hit.
No dialogue, no subtitles. Cat paws only, never human fingers.
```

Thay đổi so với v1: dũa văng **do MỀU cố ý hất** (đúng chất chảnh, và theo quy tắc 2), tiếng đổ vỡ ngoài
khung hình; 2 shot thay vì 4 mốc giây.

## Tập 4 — "Sơn chưa khô" (v2)

```
[Ảnh 1] controls MỀU's identity, slim long-legged proportions, calico pattern, black apron
and tail ring only; ignore its pose and background. [Ảnh 2] controls her hair clip only.
[Ảnh 3] controls her paw pads only: four pink toe pads and a pink main pad with a white
sakura mark.

Shot 1: medium shot, static camera in front of a pink-and-white nail table. MỀU admires her
freshly painted pink nails, smug, one eyebrow raised, then reaches into an open snack bag
beside her with the same paw.
Shot 2: cut to a close-up of that paw held up: the pink polish is smeared.
Shot 3: cut back to the medium shot. Annoyed, cheeks puffed, she hides the paw behind her
back and lifts her chin, calm and smug again.
All shots: soft pink front light; MỀU with exactly one tail, pink MEU hair clip on her left
ear, behind the table, facing the camera.
Sound: playful beat, snack crinkle, music stops on the close-up, a small "tsk", music
returns. No dialogue, no subtitles. Cat paws only, never human fingers.
```

Thay đổi so với v1: **không diễn cảnh làm lem** (model dễ diễn thành cố ý) — chỉ cho thấy **hậu quả** ở
cận cảnh; bỏ bước "khoe bàn chân kia" để mỗi shot 1 hành động.

Overlay giữ như v1 (大阪弁, chèn trong CapCut): Tập 7 「プロやからな。」, Tập 4 「まだ乾いてへん…」→「問題あらへん。」

## Ghi kết quả (điền sau khi chạy)

| Tập | Bản | Lần | Kẹp tóc | Dũa / bàn chân | Tỷ lệ thân | Câu chốt đọc được | Lỗi khác |
|---|---|---|---|---|---|---|---|
| 7 | v1 | 1 | | | | | |
| 7 | v1 | 2 | | | | | |
| 7 | v2 | 1 | | | | | |
| 7 | v2 | 2 | | | | | |
| 4 | v1 | 1 | | | | | |
| 4 | v1 | 2 | | | | | |
| 4 | v2 | 1 | | | | | |
| 4 | v2 | 2 | | | | | |
