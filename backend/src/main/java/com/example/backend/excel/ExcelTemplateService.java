package com.example.backend.excel;

import com.example.backend.dto.product.AdminProductDetail;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.util.CellRangeAddressList;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Component;
import java.io.*;
import java.util.*;
import static com.example.backend.excel.ImportModels.*;

@Component
public class ExcelTemplateService {
    public byte[] create(Kind kind,boolean samples,AdminProductDetail.Options references)throws IOException {
        try(var book=new XSSFWorkbook();var output=new ByteArrayOutputStream()){
            var text=book.createCellStyle();text.setDataFormat(book.createDataFormat().getFormat("@"));
            var money=book.createCellStyle();money.setDataFormat(book.createDataFormat().getFormat("0.00"));
            var integer=book.createCellStyle();integer.setDataFormat(book.createDataFormat().getFormat("0"));
            var header=book.createCellStyle();header.setFillForegroundColor(IndexedColors.DARK_BLUE.getIndex());header.setFillPattern(FillPatternType.SOLID_FOREGROUND);var font=book.createFont();font.setBold(true);font.setColor(IndexedColors.WHITE.getIndex());header.setFont(font);
            var definitions=kind==Kind.products?ExcelCellReader.PRODUCT_HEADERS:ExcelCellReader.COUPON_HEADERS;
            var order=kind==Kind.products?List.of("Products","Variants","Images"):List.of("Vouchers");
            for(var name:order){
                var sheet=book.createSheet(name);var columns=definitions.get(name);var row=sheet.createRow(0);
                for(int c=0;c<columns.size();c++){
                    String field=columns.get(c);row.createCell(c).setCellValue(field);row.getCell(c).setCellStyle(header);sheet.setColumnWidth(c,(field.equals("description")||field.equals("imageUrl")?50:24)*256);
                    sheet.setDefaultColumnStyle(c,Set.of("price","compareAtPrice","discountValue","minOrderValue").contains(field)?money:Set.of("stockQuantity","usageLimit","imagePosition").contains(field)?integer:text);
                    String[] values=Set.of("available","isActive").contains(field)?new String[]{"true","false"}:field.equals("discountType")?new String[]{"PERCENTAGE","FIXED_AMOUNT"}:null;
                    if(values!=null){var helper=sheet.getDataValidationHelper();var validation=helper.createValidation(helper.createExplicitListConstraint(values),new CellRangeAddressList(1,1000,c,c));validation.setShowErrorBox(true);validation.createErrorBox("Giá trị không hợp lệ","Chọn giá trị trong danh sách.");sheet.addValidationData(validation);}
                }
                sheet.createFreezePane(0,1);
            }
            var guide=book.createSheet("Guide");guide.setColumnWidth(0,110*256);
            var lines=new ArrayList<>(List.of("Stationery Store — Import CREATE_ONLY; không cập nhật dữ liệu cũ.","Chỉ .xlsx; mặc định 5 MB, tổng tối đa 1.000 dòng dữ liệu (không tính Guide/Reference). Không công thức, macro, hyperlink hoặc liên kết ngoài.","Giữ nguyên tên sheet, tên/thứ tự các cột. Bỏ qua dòng trống. Mã/SKU/productKey/handle dùng Text để giữ số 0 đầu.","Tiền: số không âm, tối đa 10 chữ số nguyên và 2 số thập phân; dấu chấm, không dấu phân cách hàng nghìn. Tồn kho/số lượt: số nguyên.","Không nhập vào production các file kiểm thử có mã TEST-. Preview không ghi database; confirm kiểm tra lại toàn bộ, rollback nếu một dòng lỗi."));
            if(kind==Kind.promotions)lines.addAll(List.of("Vouchers bắt buộc: code (tối đa 50 ký tự A-Z/a-z/0-9/_/-), discountType, discountValue > 0, isActive.","discountType: PERCENTAGE (<=100) hoặc FIXED_AMOUNT. minOrderValue, usageLimit, startDate, endDate có thể để trống.","Ngày: yyyy-MM-dd, không có giờ/múi giờ. Theo nghiệp vụ hiện tại, ngày kết thúc bằng hoặc sau ngày bắt đầu; ngày hiệu lực tính theo LocalDate của backend.","usageLimit nếu có phải >0. usedCount luôn bắt đầu 0; không có name/description/maxDiscountValue hoặc điều kiện thương hiệu/VIP."));
            else lines.addAll(List.of("Products bắt buộc: productKey, title, handle (định danh duy nhất để chống import trùng), price, available (true/false).", "Products tùy chọn: description, compareAtPrice, vendor, productType, tags. available là cho phép bán; sản phẩm mới luôn isActive=true như CRUD hiện tại.","vendor/productType/tags: tên đang tồn tại và xác định duy nhất hoặc id:<ID> từ Reference. Nhiều tag cách nhau bằng dấu ;. Không tự tạo dữ liệu tham chiếu.","Variants bắt buộc: productKey, sku, title, price, stockQuantity, available. compareAtPrice/option1/option2/option3 tùy chọn. Không có barcode.","Mỗi Products có ít nhất một Variants. productKey chỉ dùng trong file, không phải ID database. SKU phân biệt hoa thường như nghiệp vụ hiện tại.","Images có thể chỉ chứa header. Nếu có dữ liệu: productKey, imageUrl HTTP(S) không chứa tài khoản, imagePosition nguyên không âm, không trùng trong sản phẩm; tối đa 20 ảnh/sản phẩm.","Không tải ảnh từ URL về backend hoặc upload URL lên Cloudinary. Giá Products độc lập giá Variants; không ghi đè tồn kho SKU cũ.","AI: sau commit được lịch ProductIndexJob hiện có quét lại; retry theo lịch. Import thành công không có nghĩa đã đồng bộ AI."));
            for(int i=0;i<lines.size();i++)guide.createRow(i).createCell(0).setCellValue(lines.get(i));
            if(kind==Kind.products){
                var ref=book.createSheet("Reference");String[] columns={"kind","identifier","name","active"};var row=ref.createRow(0);for(int c=0;c<4;c++){ref.setColumnWidth(c,(c==2?50:24)*256);row.createCell(c).setCellValue(columns[c]);}
                int index=1;
                if(references!=null)for(var pair:List.of(Map.entry("vendor",references.vendors()),Map.entry("productType",references.categories()),Map.entry("tag",references.tags())))for(var lookup:pair.getValue()){
                    row=ref.createRow(index++);row.createCell(0).setCellValue(pair.getKey());row.createCell(1).setCellValue("id:"+lookup.id());row.createCell(2).setCellValue(lookup.name());row.createCell(3).setCellValue(Boolean.TRUE.equals(lookup.active())?"true":"false");
                }
            }
            if(samples)for(int i=1;i<=10;i++){
                if(kind==Kind.promotions)write(book.getSheet("Vouchers"),i,List.of("TEST-EXCEL-"+String.format("%02d",i),i%2==0?"PERCENTAGE":"FIXED_AMOUNT",i%2==0?"10":"15000","0","100","2020-01-01","2099-12-31","true"));
                else {
                    String key="TEST-P"+i;write(book.getSheet("Products"),i,List.of(key,"TEST-Excel Sản phẩm tiếng Việt "+i,"test-excel-product-"+i,"Dữ liệu kiểm thử, không import production","20000","25000","","","","true"));
                    int variants=i%2==0?2:1;
                    for(int j=1;j<=variants;j++)write(book.getSheet("Variants"),book.getSheet("Variants").getLastRowNum()+1,List.of(key,"TEST-000"+i+"-"+j,"Biến thể "+j,String.valueOf(10000+i*1000+j),"25000",i==1?"0":i==2?"3":String.valueOf(i*10),"true",j==1?"Xanh":"Đỏ","",""));
                }
            }
            book.write(output);return output.toByteArray();
        }
    }
    private void write(Sheet sheet,int index,List<String> values){var row=sheet.createRow(index);for(int c=0;c<values.size();c++)row.createCell(c,CellType.STRING).setCellValue(values.get(c));}
}
