package com.example.backend.excel;

import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import java.io.*;
import java.util.*;
import java.util.zip.*;
import static com.example.backend.excel.ImportModels.*;
import com.example.backend.excel.ImportModels.Row;

/** Bounded OOXML input only. Never evaluates formulas, links or image URLs. */
@Component
public class ExcelCellReader {
    @Value("${app.admin.import.max-file-bytes:5242880}") long maxFileBytes;
    @Value("${app.admin.import.max-rows:1000}") int maxRows;
    public static final Map<String,List<String>> PRODUCT_HEADERS = Map.of(
        "Products",List.of("productKey","title","handle","description","price","compareAtPrice","vendor","productType","tags","available"),
        "Variants",List.of("productKey","sku","title","price","compareAtPrice","stockQuantity","available","option1","option2","option3"),
        "Images",List.of("productKey","imageUrl","imagePosition"));
    public static final Map<String,List<String>> COUPON_HEADERS = Map.of("Vouchers",List.of("code","discountType","discountValue","minOrderValue","usageLimit","startDate","endDate","isActive"));
    public byte[] bytes(MultipartFile file){
        if(file==null || file.isEmpty() || file.getOriginalFilename()==null || !file.getOriginalFilename().toLowerCase(Locale.ROOT).endsWith(".xlsx"))throw bad("Chi chap nhan file .xlsx khong rong");
        if(file.getSize()>maxFileBytes)throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,"File vuot gioi han dung luong");
        try(var input=file.getInputStream()){
            byte[] bytes=input.readNBytes((int)Math.min(maxFileBytes+1,Integer.MAX_VALUE));
            if(bytes.length>maxFileBytes)throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,"File qua lon");
            return bytes;
        }catch(IOException error){throw bad("Khong doc duoc file Excel");}
    }
    public List<Row> read(byte[] bytes,Kind kind){
        preflight(bytes);
        var headers=kind==Kind.products?PRODUCT_HEADERS:COUPON_HEADERS;
        try(var input=new ByteArrayInputStream(bytes);var book=new XSSFWorkbook(input)){
            if(book.getWorkbookType()!=XSSFWorkbookType.XLSX || !book.getExternalLinksTables().isEmpty())throw bad("Khong ho tro macro hoac lien ket ngoai");
            for(var sheet:book){
                if(!headers.containsKey(sheet.getSheetName()) && !Set.of("Guide","Reference").contains(sheet.getSheetName()))throw bad("Sheet khong duoc ho tro: "+sheet.getSheetName());
                if(sheet.getLastRowNum()>Math.max(maxRows,10000))throw bad("Sheet vuot gioi han");
                for(var row:sheet){
                    if(row.getLastCellNum()>32)throw bad("Qua nhieu cot");
                    for(var cell:row)if((cell.getCellType()==CellType.FORMULA || cell.getHyperlink()!=null) && (!headers.containsKey(sheet.getSheetName()) || row.getRowNum()==0))throw bad("Khong chap nhan cong thuc hoac hyperlink trong workbook");
                }
            }
            var result=new ArrayList<Row>();
            for(var name:headers.keySet().stream().sorted().toList()){
                var sheet=book.getSheet(name);var columns=headers.get(name);
                if(sheet==null || sheet.getRow(0)==null)throw bad("Thieu sheet/header "+name);
                var header=sheet.getRow(0);
                if(header.getLastCellNum()!=columns.size())throw bad("Sai so cot trong sheet "+name);
                for(int c=0;c<columns.size();c++)if(header.getCell(c)==null || header.getCell(c).getCellType()!=CellType.STRING || !columns.get(c).equals(header.getCell(c).getStringCellValue().strip()))throw bad("Header khong hop le: "+name+"."+columns.get(c));
                for(int index=1;index<=sheet.getLastRowNum();index++){
                    var source=sheet.getRow(index);if(source==null)continue;
                    boolean nonempty=false;for(var cell:source)if(cell.getCellType()!=CellType.BLANK && !cell.toString().isBlank())nonempty=true;
                    if(!nonempty)continue;
                    if(result.size()>=maxRows)throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,"Qua nhieu dong du lieu");
                    var row=new Row(name,index+1);result.add(row);
                    if(source.getLastCellNum()>columns.size())row.error("*","EXTRA_COLUMNS","Có dữ liệu ngoài các cột của template.");
                    for(int c=0;c<columns.size();c++){
                        String field=columns.get(c);var cell=source.getCell(c);String value="";
                        if(cell!=null && cell.getHyperlink()!=null)row.error(field,"LINK_FORBIDDEN","Không chấp nhận hyperlink trong dữ liệu.");
                        if(cell!=null)switch(cell.getCellType()){
                            case STRING -> value=cell.getStringCellValue();
                            case NUMERIC -> {
                                if(Set.of("sku","productKey","code","handle","vendor","productType","tags").contains(field))row.error(field,"TEXT_REQUIRED","Nhập mã/định danh dưới dạng Text để giữ nguyên số 0 đầu.");
                                if(Set.of("startDate","endDate").contains(field) && DateUtil.isCellDateFormatted(cell)){
                                    var date=cell.getLocalDateTimeCellValue();value=date.toLocalDate().toString();
                                    if(!date.toLocalTime().equals(java.time.LocalTime.MIDNIGHT))row.error(field,"DATE_ONLY","Ngày áp dụng không có phần giờ.");
                                }else value=((XSSFCell)cell).getRawValue();
                            }
                            case BOOLEAN -> value=Boolean.toString(cell.getBooleanCellValue());
                            case BLANK -> {}
                            case FORMULA -> row.error(field,"FORMULA_FORBIDDEN","Không chấp nhận công thức Excel; hãy nhập giá trị trực tiếp.");
                            default -> row.error(field,"CELL_TYPE","Kiểu ô Excel không được hỗ trợ.");
                        }
                        row.values.put(field,value==null?"":value);
                    }
                }
            }
            if(result.isEmpty())throw bad("File khong co dong du lieu");
            return result;
        }catch(ResponseStatusException error){throw error;}catch(Exception error){throw bad("File Excel bi loi hoac khong phai OOXML .xlsx hop le");}
    }
    private void preflight(byte[] bytes){
        if(bytes.length<4 || bytes[0]!='P' || bytes[1]!='K')throw bad("Dinh dang file khong hop le");
        long expanded=0;int entries=0;byte[] buffer=new byte[8192];
        try(var zip=new ZipInputStream(new ByteArrayInputStream(bytes))){
            for(ZipEntry entry;(entry=zip.getNextEntry())!=null;){
                if(++entries>2000)throw bad("Qua nhieu thanh phan trong workbook");
                String name=entry.getName().toLowerCase(Locale.ROOT);
                if(name.contains("externallinks") || name.endsWith(".bin") || name.contains("vbaproject") || name.contains("../"))throw bad("Workbook chua noi dung khong duoc ho tro");
                long entrySize=0;int n;while((n=zip.read(buffer))!=-1){expanded+=n;entrySize+=n;if(expanded>32L*1024*1024 || entrySize>16L*1024*1024)throw bad("Workbook giai nen vuot gioi han");}
            }
            if(entries==0)throw bad("Workbook rong hoac bi loi");
        }catch(IOException error){throw bad("File Excel bi loi");}
    }
    static ResponseStatusException bad(String message){return new ResponseStatusException(HttpStatus.BAD_REQUEST,message);}
}
